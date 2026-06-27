package http

import (
	"net/http"

	transport "paper-reading/internal/shared/transport"
	"paper-reading/internal/user/application"
)

func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("POST /api/auth/register", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Name     string `json:"name"`
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		user, err := service.Register(body.Name, body.Email, body.Password)
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusCreated, map[string]any{"user": user})
	})

	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		session, user, err := service.Login(body.Email, body.Password)
		if err != nil {
			transport.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "paper_session", Value: session.Token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
		transport.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
	})

	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("paper_session")
		if err != nil {
			transport.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		user, err := service.Me(cookie.Value)
		if err != nil {
			transport.WriteError(w, http.StatusUnauthorized, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"user": user})
	})
}
