package domain

type UserSettings struct {
	UserID              string            `json:"user_id"`
	UILang              string            `json:"ui_lang"`
	TranslationProvider string            `json:"translation_provider"`
	AIProvider          string            `json:"ai_provider"`
	APIKeys             map[string]string `json:"api_keys,omitempty"`
}
