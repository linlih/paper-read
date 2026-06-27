package application

import (
	"strings"

	"paper-reading/internal/settings/domain"
	"paper-reading/internal/shared/persistence"
)

type Service struct {
	store *persistence.JSONStore
}

type SettingsResponse struct {
	UserID              string          `json:"user_id"`
	UILang              string          `json:"ui_lang"`
	TranslationProvider string          `json:"translation_provider"`
	AIProvider          string          `json:"ai_provider"`
	HasAPIKey           map[string]bool `json:"has_api_key"`
}

type UpdateCommand struct {
	UILang              string            `json:"ui_lang"`
	TranslationProvider string            `json:"translation_provider"`
	AIProvider          string            `json:"ai_provider"`
	APIKeys             map[string]string `json:"api_keys"`
}

func NewService(store *persistence.JSONStore) *Service {
	return &Service{store: store}
}

func (s *Service) Get(userID string) (SettingsResponse, error) {
	settings, err := s.userSettings(userID)
	if err != nil {
		return SettingsResponse{}, err
	}
	return publicSettings(settings), nil
}

func (s *Service) Update(userID string, command UpdateCommand) (SettingsResponse, error) {
	var updated domain.UserSettings
	err := s.store.Save(func(state *persistence.State) error {
		for index := range state.Settings {
			if state.Settings[index].UserID == userID {
				applyUpdate(&state.Settings[index], command)
				updated = state.Settings[index]
				return nil
			}
		}
		created := defaultSettings(userID)
		applyUpdate(&created, command)
		state.Settings = append(state.Settings, created)
		updated = created
		return nil
	})
	if err != nil {
		return SettingsResponse{}, err
	}
	return publicSettings(updated), nil
}

func (s *Service) userSettings(userID string) (domain.UserSettings, error) {
	state, err := s.store.Load()
	if err != nil {
		return domain.UserSettings{}, err
	}
	for _, settings := range state.Settings {
		if settings.UserID == userID {
			ensureDefaults(&settings)
			return settings, nil
		}
	}
	return defaultSettings(userID), nil
}

func applyUpdate(settings *domain.UserSettings, command UpdateCommand) {
	ensureDefaults(settings)
	if strings.TrimSpace(command.UILang) != "" {
		settings.UILang = strings.TrimSpace(command.UILang)
	}
	if strings.TrimSpace(command.TranslationProvider) != "" {
		settings.TranslationProvider = strings.TrimSpace(command.TranslationProvider)
	}
	if strings.TrimSpace(command.AIProvider) != "" {
		settings.AIProvider = strings.TrimSpace(command.AIProvider)
	}
	for provider, key := range command.APIKeys {
		provider = strings.TrimSpace(provider)
		if provider == "" {
			continue
		}
		if strings.TrimSpace(key) == "" {
			delete(settings.APIKeys, provider)
			continue
		}
		settings.APIKeys[provider] = key
	}
}

func defaultSettings(userID string) domain.UserSettings {
	return domain.UserSettings{
		UserID:              userID,
		UILang:              "system",
		TranslationProvider: "google",
		AIProvider:          "deepseek",
		APIKeys:             map[string]string{},
	}
}

func ensureDefaults(settings *domain.UserSettings) {
	if settings.UILang == "" {
		settings.UILang = "system"
	}
	if settings.TranslationProvider == "" {
		settings.TranslationProvider = "google"
	}
	if settings.AIProvider == "" {
		settings.AIProvider = "deepseek"
	}
	if settings.APIKeys == nil {
		settings.APIKeys = map[string]string{}
	}
}

func publicSettings(settings domain.UserSettings) SettingsResponse {
	ensureDefaults(&settings)
	hasKeys := map[string]bool{}
	for provider, key := range settings.APIKeys {
		hasKeys[provider] = strings.TrimSpace(key) != ""
	}
	return SettingsResponse{
		UserID:              settings.UserID,
		UILang:              settings.UILang,
		TranslationProvider: settings.TranslationProvider,
		AIProvider:          settings.AIProvider,
		HasAPIKey:           hasKeys,
	}
}
