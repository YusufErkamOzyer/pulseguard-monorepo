ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.
require "bootsnap/setup" # Speed up boot time by caching expensive operations.

# Automatically load environment variables from backend/.env or root .env
begin
  require "dotenv"
  backend_env = File.expand_path("../.env", __dir__)
  root_env = File.expand_path("../../.env", __dir__)
  Dotenv.load(backend_env, root_env)
rescue LoadError
  # Dotenv gem not loaded
end
