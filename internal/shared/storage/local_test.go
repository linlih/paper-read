package storage

import (
	"strings"
	"testing"
)

func TestOpenByKeyRejectsPathTraversal(t *testing.T) {
	t.Parallel()

	store := NewLocalStore(t.TempDir())

	badKeys := []string{
		"../secret.pdf",
		"/absolute/secret.pdf",
		"paper/../../secret.pdf",
	}
	for _, key := range badKeys {
		if _, err := store.OpenByKey("papers", key); err == nil {
			t.Fatalf("expected OpenByKey to reject %q", key)
		}
	}
}

func TestOpenByKeyReadsSavedObject(t *testing.T) {
	t.Parallel()

	store := NewLocalStore(t.TempDir())
	object, err := store.Save("papers", "paper/ver/assets/fig1.png", "image/png", strings.NewReader("image"))
	if err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	file, err := store.OpenByKey(object.Bucket, object.Key)
	if err != nil {
		t.Fatalf("OpenByKey returned error: %v", err)
	}
	defer file.Close()
}
