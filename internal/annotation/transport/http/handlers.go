package http

import (
	"net/http"
	"strings"

	"paper-reading/internal/annotation/application"
	transport "paper-reading/internal/shared/transport"
)

func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("/api/annotations", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			transport.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var command application.CreateAnnotationCommand
		if err := transport.DecodeJSON(r, &command); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		annotation, targets, err := service.Create(command)
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusCreated, map[string]any{"annotation": annotation, "targets": targets})
	})

	mux.HandleFunc("/api/annotations/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/annotations/")
		switch r.Method {
		case http.MethodPatch:
			var command application.UpdateAnnotationCommand
			if err := transport.DecodeJSON(r, &command); err != nil {
				transport.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			annotation, err := service.Update(id, command)
			if err != nil {
				transport.WriteError(w, http.StatusNotFound, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusOK, map[string]any{"annotation": annotation})
		case http.MethodDelete:
			if err := service.Delete(id); err != nil {
				transport.WriteError(w, http.StatusNotFound, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
		default:
			transport.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	})

	mux.HandleFunc("/api/annotation/papers/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/annotation/papers/")
		parts := strings.Split(strings.Trim(path, "/"), "/")
		if len(parts) != 2 || parts[1] != "annotations" || r.Method != http.MethodGet {
			return
		}
		payload, err := service.List(parts[0])
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, payload)
	})
}
