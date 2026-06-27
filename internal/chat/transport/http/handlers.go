package http

import (
	"net/http"
	"strings"

	"paper-reading/internal/chat/application"
	transport "paper-reading/internal/shared/transport"
)

func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("POST /api/chat/sessions", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			PaperID string `json:"paper_id"`
			UserID  string `json:"user_id"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		session, err := service.CreateSession(body.PaperID, body.UserID)
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusCreated, map[string]any{"session": session})
	})

	mux.HandleFunc("GET /api/chat/sessions", func(w http.ResponseWriter, r *http.Request) {
		sessions, err := service.Sessions(r.URL.Query().Get("paper_id"))
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
	})

	mux.HandleFunc("/api/chat/sessions/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/chat/sessions/"), "/")
		parts := strings.Split(path, "/")
		if len(parts) != 2 || parts[1] != "messages" {
			transport.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		sessionID := parts[0]
		switch r.Method {
		case http.MethodGet:
			messages, err := service.Messages(sessionID)
			if err != nil {
				transport.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusOK, map[string]any{"messages": messages})
		case http.MethodPost:
			var body struct {
				Content      string `json:"content"`
				SelectedText string `json:"selected_text"`
			}
			if err := transport.DecodeJSON(r, &body); err != nil {
				transport.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			userMessage, assistantMessage, err := service.SendMessage(sessionID, body.Content, body.SelectedText)
			if err != nil {
				transport.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusCreated, map[string]any{"messages": []any{userMessage, assistantMessage}})
		default:
			transport.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	})
}
