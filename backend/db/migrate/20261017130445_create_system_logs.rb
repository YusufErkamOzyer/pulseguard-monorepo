class CreateSystemLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :system_logs do |t|
      t.string :event_type
      t.text :message
      t.jsonb :metadata

      t.timestamps
    end
  end
end
