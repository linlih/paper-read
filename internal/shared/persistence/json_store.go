package persistence

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	annotation "paper-reading/internal/annotation/domain"
	catalog "paper-reading/internal/catalog/domain"
	chat "paper-reading/internal/chat/domain"
	ingestion "paper-reading/internal/ingestion/domain"
	reader "paper-reading/internal/reader/domain"
	settings "paper-reading/internal/settings/domain"
	user "paper-reading/internal/user/domain"
)

type State struct {
	Papers            []catalog.Paper               `json:"papers"`
	Files             []ingestion.PaperFile         `json:"files"`
	Versions          []reader.PaperVersion         `json:"versions"`
	Blocks            []reader.DocumentBlock        `json:"blocks"`
	Jobs              []ingestion.ParseJob          `json:"jobs"`
	Annotations       []annotation.Annotation       `json:"annotations"`
	AnnotationTargets []annotation.AnnotationTarget `json:"annotation_targets"`
	Users             []user.User                   `json:"users"`
	Sessions          []user.Session                `json:"sessions"`
	Settings          []settings.UserSettings       `json:"settings"`
	ChatSessions      []chat.Session                `json:"chat_sessions"`
	ChatMessages      []chat.Message                `json:"chat_messages"`
}

type JSONStore struct {
	path string
	mu   sync.Mutex
}

func NewJSONStore(path string) (*JSONStore, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	store := &JSONStore{path: path}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := store.write(State{}); err != nil {
			return nil, err
		}
	}
	return store, nil
}

func (s *JSONStore) Load() (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.read()
}

func (s *JSONStore) Save(mutator func(*State) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.read()
	if err != nil {
		return err
	}
	if err := mutator(&state); err != nil {
		return err
	}
	return s.write(state)
}

func (s *JSONStore) read() (State, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return State{}, err
	}
	if len(data) == 0 {
		return State{}, nil
	}
	var state State
	if err := json.Unmarshal(data, &state); err != nil {
		return State{}, err
	}
	return state, nil
}

func (s *JSONStore) write(state State) error {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}
