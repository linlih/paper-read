package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type Object struct {
	Bucket   string `json:"bucket"`
	Key      string `json:"key"`
	MimeType string `json:"mime_type"`
	Size     int64  `json:"size"`
	SHA256   string `json:"sha256"`
	Path     string `json:"path"`
}

type LocalStore struct {
	root string
}

func NewLocalStore(root string) *LocalStore {
	return &LocalStore{root: root}
}

func (s *LocalStore) Save(bucket string, key string, mimeType string, source io.Reader) (Object, error) {
	targetPath, err := s.resolve(bucket, key)
	if err != nil {
		return Object{}, err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return Object{}, err
	}

	file, err := os.Create(targetPath)
	if err != nil {
		return Object{}, err
	}
	defer file.Close()

	hash := sha256.New()
	size, err := io.Copy(io.MultiWriter(file, hash), source)
	if err != nil {
		return Object{}, err
	}

	return Object{
		Bucket:   bucket,
		Key:      key,
		MimeType: mimeType,
		Size:     size,
		SHA256:   hex.EncodeToString(hash.Sum(nil)),
		Path:     targetPath,
	}, nil
}

func (s *LocalStore) Open(object Object) (*os.File, error) {
	return s.OpenByKey(object.Bucket, object.Key)
}

func (s *LocalStore) OpenByKey(bucket string, key string) (*os.File, error) {
	targetPath, err := s.resolve(bucket, key)
	if err != nil {
		return nil, err
	}
	return os.Open(targetPath)
}

func (s *LocalStore) resolve(bucket string, key string) (string, error) {
	if strings.TrimSpace(bucket) == "" || strings.TrimSpace(key) == "" {
		return "", errors.New("bucket and key are required")
	}
	if filepath.IsAbs(bucket) || filepath.IsAbs(key) {
		return "", errors.New("absolute object paths are not allowed")
	}
	cleanBucket := filepath.Clean(bucket)
	cleanKey := filepath.Clean(key)
	if cleanBucket == "." || cleanKey == "." || strings.HasPrefix(cleanBucket, "..") || strings.HasPrefix(cleanKey, "..") {
		return "", errors.New("object path escapes storage root")
	}
	targetPath := filepath.Join(s.root, cleanBucket, cleanKey)
	rootPath, err := filepath.Abs(s.root)
	if err != nil {
		return "", err
	}
	absoluteTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(rootPath, absoluteTarget)
	if err != nil {
		return "", err
	}
	if relative == "." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || relative == ".." || filepath.IsAbs(relative) {
		return "", errors.New("object path escapes storage root")
	}
	return absoluteTarget, nil
}
