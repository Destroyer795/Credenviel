//go:build azure

package storage

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func TestAzureBlobSigner_SASValidation(t *testing.T) {
	rg := os.Getenv("AZURE_RESOURCE_GROUP")
	if rg != "rg-credenviel-dev" {
		t.Skipf("Safety guard: AZURE_RESOURCE_GROUP must be 'rg-credenviel-dev' (got %q)", rg)
	}

	accountName := os.Getenv("STORAGE_ACCOUNT_NAME")
	if accountName == "" {
		t.Skip("STORAGE_ACCOUNT_NAME is not set")
	}

	signer, err := NewAzureBlobSigner(accountName, os.Getenv("AZURE_CLIENT_ID"))
	if err != nil {
		t.Fatalf("failed to create signer: %v", err)
	}
	signer.SetContainerName("test-scratch")

	store, err := NewAzureBlobStore(accountName, os.Getenv("AZURE_CLIENT_ID"))
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	testData := []byte("PDF-1.4 test payload for Azure SAS validation")
	jobID := fmt.Sprintf("job-sas-%d", time.Now().UnixNano())
	filename := "cert.pdf"
	key := fmt.Sprintf("test-scratch/%s/%s", jobID, filename)

	defer func() {
		// Clean up
		containerClient := store.client.ServiceClient().NewContainerClient("test-scratch")
		_, _ = containerClient.NewBlobClient(fmt.Sprintf("%s/%s", jobID, filename)).Delete(context.Background(), nil)
	}()

	// 1. Happy path: valid signed URL accepts PUT with x-ms-blob-type: BlockBlob header
	t.Run("valid PUT with BlockBlob header succeeds", func(t *testing.T) {
		uploadInfo, err := signer.SignUpload(jobID, filename, 15*time.Minute)
		if err != nil {
			t.Fatalf("failed to sign upload: %v", err)
		}

		if uploadInfo.Headers["x-ms-blob-type"] != "BlockBlob" {
			t.Errorf("expected header x-ms-blob-type: BlockBlob, got %v", uploadInfo.Headers)
		}

		req, err := http.NewRequest(http.MethodPut, uploadInfo.URL, bytes.NewReader(testData))
		if err != nil {
			t.Fatalf("failed to create request: %v", err)
		}
		for k, v := range uploadInfo.Headers {
			req.Header.Set(k, v)
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("PUT request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			t.Errorf("expected status 201 Created, got %d", resp.StatusCode)
		}

		// Verify existence in store
		exists, err := store.Exists(context.Background(), key)
		if err != nil {
			t.Fatalf("Exists check failed: %v", err)
		}
		if !exists {
			t.Errorf("expected blob %s to exist in store", key)
		}
	})

	// 2. Reject PUT without valid signature (tampered signature)
	t.Run("rejects tampered signature", func(t *testing.T) {
		uploadInfo, err := signer.SignUpload(jobID, "tampered.pdf", 15*time.Minute)
		if err != nil {
			t.Fatalf("failed to sign upload: %v", err)
		}

		tamperedURL := strings.Replace(uploadInfo.URL, "sig=", "sig=tampered", 1)
		req, err := http.NewRequest(http.MethodPut, tamperedURL, bytes.NewReader(testData))
		if err != nil {
			t.Fatalf("failed to create request: %v", err)
		}
		req.Header.Set("x-ms-blob-type", "BlockBlob")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusBadRequest {
			t.Errorf("expected 403 or 400 for tampered SAS, got %d", resp.StatusCode)
		}
	})

	// 3. Reject PUT after expiry (short TTL)
	t.Run("rejects expired SAS token", func(t *testing.T) {
		// TTL of 1 second
		uploadInfo, err := signer.SignUpload(jobID, "expired.pdf", 1*time.Second)
		if err != nil {
			t.Fatalf("failed to sign upload: %v", err)
		}

		// Wait 2 seconds for expiry
		time.Sleep(2 * time.Second)

		req, err := http.NewRequest(http.MethodPut, uploadInfo.URL, bytes.NewReader(testData))
		if err != nil {
			t.Fatalf("failed to create request: %v", err)
		}
		req.Header.Set("x-ms-blob-type", "BlockBlob")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 403 Forbidden for expired SAS, got %d", resp.StatusCode)
		}
	})
}
