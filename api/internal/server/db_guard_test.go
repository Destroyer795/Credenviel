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
