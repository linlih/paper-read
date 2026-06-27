package http

import (
	"net/http"

	settingsapp "paper-reading/internal/settings/application"
	transport "paper-reading/internal/shared/transport"
	userapp "paper-reading/internal/user/application"
)

func Register(mux *http.ServeMux, service *settingsapp.Service, userService *userapp.Service) {
	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		user, ok := currentUser(w, r, userService)
		if !ok {
			return
		}
		settings, err := service.Get(user.ID)
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"settings": settings})
	})

	mux.HandleFunc("PATCH /api/settings", func(w http.ResponseWriter, r *http.Request) {
		user, ok := currentUser(w, r, userService)
		if !ok {
			return
		}
		var body settingsapp.UpdateCommand
		if err := transport.DecodeJSON(r, &body); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		settings, err := service.Update(user.ID, body)
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"settings": settings})
	})
}

func currentUser(w http.ResponseWriter, r *http.Request, service *userapp.Service) (struct{ ID string }, bool) {
	cookie, err := r.Cookie("paper_session")
	if err != nil {
		transport.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return struct{ ID string }{}, false
	}
	user, err := service.Me(cookie.Value)
	if err != nil {
		transport.WriteError(w, http.StatusUnauthorized, err.Error())
		return struct{ ID string }{}, false
	}
	return struct{ ID string }{ID: user.ID}, true
}
