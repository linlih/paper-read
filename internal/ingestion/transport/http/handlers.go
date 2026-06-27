package http

import (
	"net/http"
	"strings"

	"paper-reading/internal/ingestion/application"
	transport "paper-reading/internal/shared/transport"
)

func Register(mux *http.ServeMux, service *application.Service) {
	mux.HandleFunc("/api/parse-jobs/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			transport.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/api/parse-jobs/")
		job, err := service.Job(id)
		if err != nil {
			transport.WriteError(w, http.StatusNotFound, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusOK, map[string]any{"job": job})
	})
}

func UploadHandler(service *application.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			transport.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, "missing file")
			return
		}
		defer file.Close()
		paperID := r.PathValue("paperID")
		result, err := service.UploadAndCreateVersion(paperID, header.Filename, header.Header.Get("content-type"), file)
		if err != nil {
			transport.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		transport.WriteJSON(w, http.StatusCreated, result)
	}
}

