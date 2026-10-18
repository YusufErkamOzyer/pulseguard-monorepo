Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      get "health", to: "health#show"
      get "dashboard", to: "dashboard#show"
      get "status_page", to: "status_page#show"

      resources :services, only: [:index, :show, :update]
      resources :status_updates, only: [:index, :create]

      resources :alerts, only: [:index, :show, :create] do
        collection do
          get :metrics
          post :simulate_storm
        end
      end

      resources :incidents, only: [:index, :show, :create] do
        member do
          patch :transition
          post :apply_ai_pass
          post :generate_postmortem
          post :draft_broadcast
          post :publish_broadcast
        end
      end
      resources :postmortems, only: [:index, :show, :update]

      # Phase 0 backward compatibility
      resources :system_logs, only: [:index, :create]
      post "ai_test", to: "ai_test#create"
    end
  end
end
