Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      get "health", to: "health#show"
      resources :system_logs, only: [:index, :create]
      post "ai_test", to: "ai_test#create"
    end
  end
end
