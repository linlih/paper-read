package http

import (
	"net/http"

	"paper-reading/internal/catalog/application"
	transport "paper-reading/internal/shared/transport"
)

func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("/api/papers", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			papers, err := service.List(application.ListFilter{
				Query:  r.URL.Query().Get("query"),
				Source: r.URL.Query().Get("source"),
				Status: r.URL.Query().Get("status"),
				Tag:    r.URL.Query().Get("tag"),
			})
			if err != nil {
				transport.WriteError(w, http.StatusInternalServerError, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusOK, map[string]any{"papers": papers})
		case http.MethodPost:
			var command application.CreatePaperCommand
			if err := transport.DecodeJSON(r, &command); err != nil {
				transport.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			paper, err := service.Create(command)
			if err != nil {
				transport.WriteError(w, http.StatusBadRequest, err.Error())
				return
			}
			transport.WriteJSON(w, http.StatusCreated, map[string]any{"paper": paper})
		default:
			transport.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
	})

	mux.HandleFunc("GET /api/papers/{paperID}", func(w http.ResponseWriter, r *http.Request) {
		paper, err := service.Get(r.PathValue("paperID"))
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"paper": paper})
	})

	mux.HandleFunc("PATCH /api/papers/{paperID}", func(w http.ResponseWriter, r *http.Request) {
		var command application.UpsertPaperCommand
		if err := transport.DecodeJSON(r, &command); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		paper, err := service.Update(r.PathValue("paperID"), command)
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"paper": paper})
	})

	mux.HandleFunc("DELETE /api/papers/{paperID}", func(w http.ResponseWriter, r *http.Request) {
		if err := service.Delete(r.PathValue("paperID")); err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
}
