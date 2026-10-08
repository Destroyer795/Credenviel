package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/bloberror"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/sas"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/service"
)

// AzureBlobStore implements Store backed by Azure Blob Storage.
type AzureBlobStore struct {
	client      *azblob.Client
	accountName string
}

// NewAzureBlobStore creates a new Azure Blob Store using DefaultAzureCredential.
func NewAzureBlobStore(accountName, clientID string) (*AzureBlobStore, error) {
	if accountName == "" {
		return nil, errors.New("STORAGE_ACCOUNT_NAME must not be empty")
	}

	client, err := newBlobClient(accountName, clientID)
	if err != nil {
		return nil, err
	}

	return &AzureBlobStore{
		client:      client,
		accountName: accountName,
	}, nil
}

func (s *AzureBlobStore) splitKey(key string) (string, string, error) {
	return splitBlobKey(key)
}

func splitBlobKey(key string) (string, string, error) {
	clean := strings.Trim(strings.ReplaceAll(key, "\\", "/"), "/")
	parts := strings.SplitN(clean, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("invalid blob key %q: expected 'container/blob-path'", key)
	}
	return parts[0], parts[1], nil
}

func (s *AzureBlobStore) Put(ctx context.Context, key string, r io.Reader, maxBytes int64) (int64, error) {
	container, blobName, err := s.splitKey(key)
	if err != nil {
		return 0, err
	}

	limited := io.LimitReader(r, maxBytes+1)
	buf := new(bytes.Buffer)
	n, err := io.Copy(buf, limited)
	if err != nil {
		return 0, fmt.Errorf("failed to read upload stream: %w", err)
	}
	if n > maxBytes {
		return 0, ErrTooLarge
	}

	_, err = s.client.UploadBuffer(ctx, container, blobName, buf.Bytes(), nil)
	if err != nil {
		return 0, fmt.Errorf("failed to upload blob to azure: %w", err)
	}
	return n, nil
}

func (s *AzureBlobStore) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	container, blobName, err := s.splitKey(key)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.DownloadStream(ctx, container, blobName, nil)
	if err != nil {
		if bloberror.HasCode(err, bloberror.BlobNotFound, bloberror.ContainerNotFound, bloberror.ResourceNotFound) {
			return nil, os.ErrNotExist
		}
		return nil, fmt.Errorf("failed to download blob: %w", err)
	}
	return resp.Body, nil
}

func (s *AzureBlobStore) Exists(ctx context.Context, key string) (bool, error) {
	container, blobName, err := s.splitKey(key)
	if err != nil {
		return false, err
	}

	blobClient := s.client.ServiceClient().NewContainerClient(container).NewBlobClient(blobName)
	_, err = blobClient.GetProperties(ctx, nil)
	if err != nil {
		if bloberror.HasCode(err, bloberror.BlobNotFound, bloberror.ContainerNotFound, bloberror.ResourceNotFound) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// AzureBlobSigner generates scoped user-delegation SAS URLs for client direct upload.
type AzureBlobSigner struct {
	client        *azblob.Client
	accountName   string
	containerName string
}

// NewAzureBlobSigner creates a new user-delegation SAS signer.
func NewAzureBlobSigner(accountName, clientID string) (*AzureBlobSigner, error) {
	if accountName == "" {
		return nil, errors.New("STORAGE_ACCOUNT_NAME must not be empty")
	}

	client, err := newBlobClient(accountName, clientID)
	if err != nil {
		return nil, err
	}

	return &AzureBlobSigner{
		client:        client,
		accountName:   accountName,
		containerName: "raw-uploads",
	}, nil
}

// SetContainerName overrides the default container name (useful for testing on test-scratch).
func (s *AzureBlobSigner) SetContainerName(name string) {
	s.containerName = name
}

func (s *AzureBlobSigner) SignUpload(jobID, filename string, ttl time.Duration) (UploadInfo, error) {
	now := time.Now().UTC()
	start := now.Add(-5 * time.Minute)
	expiry := now.Add(ttl)

	startStr := start.Format(sas.TimeFormat)
	expiryStr := expiry.Format(sas.TimeFormat)

	keyInfo := service.KeyInfo{
		Start:  &startStr,
		Expiry: &expiryStr,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	udc, err := s.client.ServiceClient().GetUserDelegationCredential(ctx, keyInfo, nil)
	if err != nil {
		return UploadInfo{}, fmt.Errorf("failed to get user delegation credential: %w", err)
	}

	permissions := sas.BlobPermissions{
		Create: true,
		Write:  true,
	}

	blobPath := fmt.Sprintf("%s/%s", jobID, filename)
	sigValues := sas.BlobSignatureValues{
		Protocol:      sas.ProtocolHTTPS,
		StartTime:     start,
		ExpiryTime:    expiry,
		Permissions:   permissions.String(),
		ContainerName: s.containerName,
		BlobName:      blobPath,
	}

	sasParams, err := sigValues.SignWithUserDelegation(udc)
	if err != nil {
		return UploadInfo{}, fmt.Errorf("failed to sign user delegation SAS: %w", err)
	}

	uploadURL := fmt.Sprintf("https://%s.blob.core.windows.net/%s/%s/%s?%s",
		s.accountName,
		s.containerName,
		url.PathEscape(jobID),
		url.PathEscape(filename),
		sasParams.Encode(),
	)

	return UploadInfo{
		Method:    "PUT",
		URL:       uploadURL,
		ExpiresAt: expiry,
		Headers: map[string]string{
			"x-ms-blob-type": "BlockBlob",
		},
	}, nil
}

// SignRead generates a scoped 15-minute user-delegation read SAS for side-by-side document preview.
func (s *AzureBlobSigner) SignRead(blobKey string, ttl time.Duration) (string, error) {
	container, blobPath, err := splitBlobKey(blobKey)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	start := now.Add(-5 * time.Minute)
	expiry := now.Add(ttl)

	startStr := start.Format(sas.TimeFormat)
	expiryStr := expiry.Format(sas.TimeFormat)

	keyInfo := service.KeyInfo{
		Start:  &startStr,
		Expiry: &expiryStr,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	udc, err := s.client.ServiceClient().GetUserDelegationCredential(ctx, keyInfo, nil)
	if err != nil {
		return "", fmt.Errorf("failed to get user delegation credential for read sas: %w", err)
	}

	permissions := sas.BlobPermissions{
		Read: true,
	}

	sigValues := sas.BlobSignatureValues{
		Protocol:      sas.ProtocolHTTPS,
		StartTime:     start,
		ExpiryTime:    expiry,
		Permissions:   permissions.String(),
		ContainerName: container,
		BlobName:      blobPath,
	}

	sasParams, err := sigValues.SignWithUserDelegation(udc)
	if err != nil {
		return "", fmt.Errorf("failed to sign user delegation read SAS: %w", err)
	}

	readURL := fmt.Sprintf("https://%s.blob.core.windows.net/%s/%s?%s",
		s.accountName,
		container,
		url.PathEscape(blobPath),
		sasParams.Encode(),
	)

	return readURL, nil
}


func newBlobClient(accountName, clientID string) (*azblob.Client, error) {
	if clientID != "" && os.Getenv("AZURE_CLIENT_ID") == "" {
		_ = os.Setenv("AZURE_CLIENT_ID", clientID)
	}
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Azure credential: %w", err)
	}

	serviceURL := fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
	client, err := azblob.NewClient(serviceURL, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create azblob client: %w", err)
	}

	return client, nil
}
