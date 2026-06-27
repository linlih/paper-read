package application

import (
	"path/filepath"
	"testing"

	"paper-reading/internal/shared/persistence"
)

func TestRegisterLoginAndMe(t *testing.T) {
	t.Parallel()
	service := newTestUserService(t)

	created, err := service.Register("Alice", "alice@example.com", "password123")
	if err != nil {
		t.Fatalf("Register returned error: %v", err)
	}
	if created.PasswordHash != "" {
		t.Fatal("registered user response must not expose password hash")
	}

	session, user, err := service.Login("alice@example.com", "password123")
	if err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if user.ID != created.ID || session.Token == "" {
		t.Fatalf("unexpected login result: user=%#v session=%#v", user, session)
	}

	me, err := service.Me(session.Token)
	if err != nil {
		t.Fatalf("Me returned error: %v", err)
	}
	if me.Email != "alice@example.com" {
		t.Fatalf("expected alice@example.com, got %q", me.Email)
	}
}

func TestRegisterRejectsDuplicateEmail(t *testing.T) {
	t.Parallel()
	service := newTestUserService(t)
	if _, err := service.Register("Alice", "alice@example.com", "password123"); err != nil {
		t.Fatalf("Register returned error: %v", err)
	}
	if _, err := service.Register("Alice Again", "alice@example.com", "password123"); err == nil {
		t.Fatal("expected duplicate email error")
	}
}

func newTestUserService(t *testing.T) *Service {
	t.Helper()
	store, err := persistence.NewJSONStore(filepath.Join(t.TempDir(), "store.json"))
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	return NewService(store)
}
