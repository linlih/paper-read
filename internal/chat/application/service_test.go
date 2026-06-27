package application

import (
	"path/filepath"
	"testing"

	"paper-reading/internal/shared/persistence"
)

func TestAppendMessageStoresUserAndAssistantMessages(t *testing.T) {
	t.Parallel()
	service := newTestChatService(t)
	session, err := service.CreateSession("paper_test", "usr_test")
	if err != nil {
		t.Fatalf("CreateSession returned error: %v", err)
	}
	userMessage, assistantMessage, err := service.SendMessage(session.ID, "Explain this", "selected passage")
	if err != nil {
		t.Fatalf("SendMessage returned error: %v", err)
	}
	if userMessage.Role != "user" || assistantMessage.Role != "assistant" {
		t.Fatalf("unexpected roles: %#v %#v", userMessage, assistantMessage)
	}
	messages, err := service.Messages(session.ID)
	if err != nil {
		t.Fatalf("Messages returned error: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
}

func newTestChatService(t *testing.T) *Service {
	t.Helper()
	store, err := persistence.NewJSONStore(filepath.Join(t.TempDir(), "store.json"))
	if err != nil {
		t.Fatalf("NewJSONStore returned error: %v", err)
	}
	return NewService(store)
}
