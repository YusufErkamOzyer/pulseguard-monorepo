ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

require "bundler/setup" # Set up gems listed in the Gemfile.
require "bootsnap/setup" # Speed up boot time by caching expensive operations.

# Load environment variables while strictly preserving Render.com / OS ENV precedence (ENV[key] ||= value)
[
  File.expand_path("../.env", __dir__),
  File.expand_path("../../.env", __dir__)
].each do |env_file|
  next unless File.exist?(env_file)

  File.readlines(env_file).each do |line|
    stripped = line.strip
    next if stripped.empty? || stripped.start_with?("#")

    key, val = stripped.split("=", 2)
    next if key.nil? || val.nil?

    clean_key = key.strip
    clean_val = val.strip.gsub(/\A['"]|['"]\z/, "")
    ENV[clean_key] ||= clean_val unless clean_val.empty?
  end
end
