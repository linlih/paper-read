package domain

import "time"

type Session struct {
	ID        string    `json:"id"`
	PaperID   string    `json:"paper_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID           string    `json:"id"`
	SessionID    string    `json:"session_id"`
	Role         string    `json:"role"`
	Content      string    `json:"content"`
	SelectedText string    `json:"selected_text"`
	CreatedAt    time.Time `json:"created_at"`
}
