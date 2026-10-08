package server

import (
	"testing"
)

func TestValidateTestDBName(t *testing.T) {
	tests := []struct {
		name    string
		dbName  string
		wantErr bool
	}{
		{
			name:    "rejects dev database credenviel",
			dbName:  "credenviel",
			wantErr: true,
		},
		{
			name:    "rejects postgres maintenance database",
			dbName:  "postgres",
			wantErr: true,
		},
		{
			name:    "rejects empty database name",
			dbName:  "",
			wantErr: true,
		},
		{
			name:    "rejects whitespace database name",
			dbName:  "   ",
			wantErr: true,
		},
		{
			name:    "rejects other database names",
			dbName:  "surplus_db",
			wantErr: true,
		},
		{
			name:    "accepts credenviel_test",
			dbName:  "credenviel_test",
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateTestDBName(tt.dbName)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTestDBName(%q) error = %v, wantErr %v", tt.dbName, err, tt.wantErr)
			}
		})
	}
}

func TestValidateTestDBTarget(t *testing.T) {
	tests := []struct {
		name    string
		dbName  string
		host    string
		wantErr bool
	}{
		{name: "accepts credenviel_test on localhost", dbName: "credenviel_test", host: "localhost", wantErr: false},
		{name: "accepts credenviel_test on 127.0.0.1", dbName: "credenviel_test", host: "127.0.0.1", wantErr: false},
		{name: "accepts credenviel_test on ::1", dbName: "credenviel_test", host: "::1", wantErr: false},
		{name: "accepts credenviel_test on empty host (defaults to localhost)", dbName: "credenviel_test", host: "", wantErr: false},
		{name: "rejects credenviel_test on azure postgres host", dbName: "credenviel_test", host: "psql-credenviel.postgres.database.azure.com", wantErr: true},
		{name: "rejects credenviel_test on arbitrary remote ip", dbName: "credenviel_test", host: "10.0.0.4", wantErr: true},
		{name: "rejects non-test db on localhost", dbName: "credenviel", host: "localhost", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateTestDBTarget(tt.dbName, tt.host)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTestDBTarget(%q, %q) error = %v, wantErr %v", tt.dbName, tt.host, err, tt.wantErr)
			}
		})
	}
}

