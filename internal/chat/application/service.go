package application

import (
	"errors"
	"strings"
	"time"

	"paper-reading/internal/chat/domain"
	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
)

type Service struct {
	store *persistence.JSONStore
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) CreateSession(paperID string, userID string) (domain.Session, error) {
	if strings.TrimSpace(paperID) == "" {
		return domain.Session{}, errors.New("paper_id is required")
	}
	now := time.Now().UTC()
	session := domain.Session{
		ID:        kernel.NewID("chat"),
		PaperID:   strings.TrimSpace(paperID),
		UserID:    defaultString(strings.TrimSpace(userID), "local"),
		CreatedAt: now,
		UpdatedAt: now,
	}
	err := s.store.Save(func(state *persistence.State) error {
		state.ChatSessions = append([]domain.Session{session}, state.ChatSessions...)
		return nil
	})
	return session, err
}

func (s *Service) Sessions(paperID string) ([]domain.Session, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	sessions := []domain.Session{}
	for _, session := range state.ChatSessions {
		if strings.TrimSpace(paperID) == "" || session.PaperID == paperID {
			sessions = append(sessions, session)
		}
	}
	return sessions, nil
}

func (s *Service) SendMessage(sessionID string, content string, selectedText string) (domain.Message, domain.Message, error) {
	content = strings.TrimSpace(content)
	if sessionID == "" || content == "" {
		return domain.Message{}, domain.Message{}, errors.New("session_id and content are required")
	}
	now := time.Now().UTC()
	userMessage := domain.Message{
		ID:           kernel.NewID("msg"),
		SessionID:    sessionID,
		Role:         "user",
		Content:      content,
		SelectedText: selectedText,
		CreatedAt:    now,
	}
	assistantMessage := domain.Message{
		ID:           kernel.NewID("msg"),
		SessionID:    sessionID,
		Role:         "assistant",
		Content:      deterministicAssistant(content, selectedText),
		SelectedText: selectedText,
		CreatedAt:    now.Add(time.Millisecond),
	}
	err := s.store.Save(func(state *persistence.State) error {
		found := false
		for index := range state.ChatSessions {
			if state.ChatSessions[index].ID == sessionID {
				state.ChatSessions[index].UpdatedAt = now
				found = true
				break
			}
		}
		if !found {
			return errors.New("chat session not found")
		}
		state.ChatMessages = append(state.ChatMessages, userMessage, assistantMessage)
		return nil
	})
	return userMessage, assistantMessage, err
}

func (s *Service) Messages(sessionID string) ([]domain.Message, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	messages := []domain.Message{}
	for _, message := range state.ChatMessages {
		if message.SessionID == sessionID {
			messages = append(messages, message)
		}
	}
	return messages, nil
}

func deterministicAssistant(content string, selectedText string) string {
	combined := strings.ToLower(selectedText + " " + content)
	switch {
	case strings.Contains(combined, "attention"), strings.Contains(combined, "softmax"):
		return "Attention compares a query with keys to decide which values matter most. Softmax turns those scores into weights, so the model can focus on the most relevant tokens."
	case strings.Contains(combined, "transformer"):
		return "A Transformer uses parallel self-attention instead of recurrent steps. This lets every token compare itself with every other token in the same layer."
	case strings.Contains(combined, "bert"):
		return "BERT learns bidirectional representations with masked language modeling. It predicts hidden tokens from both left and right context, which is useful for understanding tasks."
	default:
		return "This passage is important because it anchors the paper's method or claim. Re-read the surrounding section and compare it with the paper's evidence."
	}
}

func defaultString(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
