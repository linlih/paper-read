package application

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"paper-reading/internal/shared/kernel"
	"paper-reading/internal/shared/persistence"
	user "paper-reading/internal/user/domain"
)

type Service struct {
	store *persistence.JSONStore
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) Register(name string, email string, password string) (user.User, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" || email == "" || len(password) < 6 {
		return user.User{}, errors.New("name, email, and password with at least 6 characters are required")
	}
	now := time.Now().UTC()
	created := user.User{
		ID:           kernel.NewID("usr"),
		Name:         name,
		Email:        email,
		Role:         user.RoleUser,
		PasswordHash: hashPassword(password),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	err := s.store.Save(func(state *persistence.State) error {
		for _, existing := range state.Users {
			if strings.EqualFold(existing.Email, email) {
				return errors.New("email is already registered")
			}
		}
		if len(state.Users) == 0 {
			created.Role = user.RoleAdmin
		}
		state.Users = append(state.Users, created)
		return nil
	})
	created.PasswordHash = ""
	return created, err
}

func (s *Service) Login(email string, password string) (user.Session, user.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	state, err := s.store.Load()
	if err != nil {
		return user.Session{}, user.User{}, err
	}
	for _, existing := range state.Users {
		if strings.EqualFold(existing.Email, email) && existing.PasswordHash == hashPassword(password) {
			now := time.Now().UTC()
			session := user.Session{
				ID:        kernel.NewID("ses"),
				UserID:    existing.ID,
				Token:     randomToken(),
				CreatedAt: now,
				ExpiresAt: now.Add(30 * 24 * time.Hour),
			}
			err := s.store.Save(func(state *persistence.State) error {
				state.Sessions = append(state.Sessions, session)
				return nil
			})
			existing.PasswordHash = ""
			return session, existing, err
		}
	}
	return user.Session{}, user.User{}, errors.New("invalid credentials")
}

func (s *Service) Me(token string) (user.User, error) {
	state, err := s.store.Load()
	if err != nil {
		return user.User{}, err
	}
	now := time.Now().UTC()
	for _, session := range state.Sessions {
		if session.Token == token && session.ExpiresAt.After(now) {
			for _, existing := range state.Users {
				if existing.ID == session.UserID {
					existing.PasswordHash = ""
					return existing, nil
				}
			}
		}
	}
	return user.User{}, errors.New("unauthorized")
}

func (s *Service) Users() ([]user.User, error) {
	state, err := s.store.Load()
	if err != nil {
		return nil, err
	}
	users := make([]user.User, 0, len(state.Users))
	for _, existing := range state.Users {
		existing.PasswordHash = ""
		users = append(users, existing)
	}
	return users, nil
}

func (s *Service) DeleteUser(userID string) error {
	return s.store.Save(func(state *persistence.State) error {
		deleteIndex := -1
		adminCount := 0
		for index, existing := range state.Users {
			if existing.Role == user.RoleAdmin {
				adminCount++
			}
			if existing.ID == userID {
				deleteIndex = index
			}
		}
		if deleteIndex < 0 {
			return errors.New("user not found")
		}
		if state.Users[deleteIndex].Role == user.RoleAdmin && adminCount <= 1 {
			return errors.New("cannot delete the last admin")
		}
		state.Users = append(state.Users[:deleteIndex], state.Users[deleteIndex+1:]...)
		sessions := state.Sessions[:0]
		for _, session := range state.Sessions {
			if session.UserID != userID {
				sessions = append(sessions, session)
			}
		}
		state.Sessions = sessions
		return nil
	})
}

func (s *Service) RequireAdmin(token string) (user.User, error) {
	existing, err := s.Me(token)
	if err != nil {
		return user.User{}, err
	}
	if existing.Role != user.RoleAdmin {
		return user.User{}, errors.New("forbidden")
	}
	return existing, nil
}

func hashPassword(password string) string {
	sum := sha256.Sum256([]byte("paper-reading:" + password))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func randomToken() string {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		return kernel.NewID("tok")
	}
	return hex.EncodeToString(data[:])
}
