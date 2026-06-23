import { useMemo, useState } from "react";
import {
  NOTIFICATION_MERGE_FIELDS,
  NOTIFICATION_TEMPLATE_SAMPLE_DATA,
  listNotificationTemplates,
  renderNotificationTemplatePreview,
  resetNotificationTemplatesToDefaults,
  updateNotificationTemplate,
} from "../lib/notificationTemplatesStore";

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #d6d3d1",
  fontSize: "14px",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: "92px",
  resize: "vertical",
  fontFamily: "inherit",
};

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#374151" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: "16px", height: "16px", accentColor: "#0f766e" }}
      />
      <span>{label}</span>
    </label>
  );
}

export default function NotificationTemplates() {
  const [templates, setTemplates] = useState(() => listNotificationTemplates());
  const [selectedTemplateType, setSelectedTemplateType] = useState(
    templates[0]?.type || ""
  );
  const [sampleData, setSampleData] = useState(() => NOTIFICATION_TEMPLATE_SAMPLE_DATA);

  const activeTemplate = useMemo(
    () =>
      templates.find((template) => template.type === selectedTemplateType) ||
      templates[0] ||
      null,
    [templates, selectedTemplateType]
  );

  const preview = useMemo(() => {
    if (!activeTemplate) return { emailSubject: "", emailBody: "", smsMessage: "" };
    return renderNotificationTemplatePreview(activeTemplate, sampleData);
  }, [activeTemplate, sampleData]);

  function updateDraft(field, value) {
    if (!activeTemplate) return;

    setTemplates((currentTemplates) =>
      currentTemplates.map((template) =>
        template.type === activeTemplate.type
          ? {
              ...template,
              [field]: value,
            }
          : template
      )
    );
  }

  async function saveTemplate() {
    if (!activeTemplate) return;

    try {
      await updateNotificationTemplate(activeTemplate.type, activeTemplate);
      setTemplates(listNotificationTemplates());
      alert("Notification template saved.");
    } catch (error) {
      alert(error.message || "Unable to save notification template.");
    }
  }

  async function restoreDefaults() {
    if (!window.confirm("Restore all notification templates to defaults?")) {
      return;
    }

    try {
      await resetNotificationTemplatesToDefaults();
      const resetTemplates = listNotificationTemplates();
      setTemplates(resetTemplates);
      setSelectedTemplateType(resetTemplates[0]?.type || "");
    } catch (error) {
      alert(error.message || "Unable to restore notification template defaults.");
    }
  }

  return (
    <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
      <header style={{ marginBottom: "16px" }}>
        <h1 style={{ marginBottom: "8px" }}>Notification Templates</h1>
        <p style={{ margin: 0, color: "#57534e", lineHeight: 1.5, maxWidth: "900px" }}>
          Manage default Email/SMS message content and internal staff notification toggles.
          This is template-only configuration. No emails or SMS messages are sent from this
          screen yet.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <aside
          style={{
            background: "#ffffff",
            border: "1px solid #e7e5e4",
            borderRadius: "16px",
            padding: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <h2 style={{ margin: 0, fontSize: "16px" }}>Template Types</h2>
            <button
              type="button"
              onClick={restoreDefaults}
              style={{
                border: "1px solid #d6d3d1",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#44403c",
                fontWeight: 700,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Restore Defaults
            </button>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            {templates.map((template) => (
              <button
                key={template.type}
                type="button"
                onClick={() => setSelectedTemplateType(template.type)}
                style={{
                  textAlign: "left",
                  padding: "10px",
                  borderRadius: "10px",
                  border:
                    template.type === activeTemplate?.type
                      ? "1px solid #0f766e"
                      : "1px solid #e7e5e4",
                  background:
                    template.type === activeTemplate?.type ? "#f0fdfa" : "#ffffff",
                  cursor: "pointer",
                }}
              >
                <strong style={{ color: "#1f2937" }}>{template.label}</strong>
              </button>
            ))}
          </div>
        </aside>

        {activeTemplate ? (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e7e5e4",
              borderRadius: "16px",
              padding: "16px",
              display: "grid",
              gap: "14px",
            }}
          >
            <div>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700 }}>Template Name</span>
                <input
                  type="text"
                  value={activeTemplate.templateName}
                  onChange={(event) => updateDraft("templateName", event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700 }}>Email Subject</span>
                <input
                  type="text"
                  value={activeTemplate.emailSubject}
                  onChange={(event) => updateDraft("emailSubject", event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700 }}>Email Body</span>
                <textarea
                  value={activeTemplate.emailBody}
                  onChange={(event) => updateDraft("emailBody", event.target.value)}
                  style={{ ...textareaStyle, minHeight: "140px" }}
                />
              </label>
            </div>

            <div>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontWeight: 700 }}>SMS Message</span>
                <textarea
                  value={activeTemplate.smsMessage}
                  onChange={(event) => updateDraft("smsMessage", event.target.value)}
                  style={textareaStyle}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <Toggle
                label="Email Enabled"
                checked={activeTemplate.emailEnabled}
                onChange={(checked) => updateDraft("emailEnabled", checked)}
              />
              <Toggle
                label="SMS Enabled"
                checked={activeTemplate.smsEnabled}
                onChange={(checked) => updateDraft("smsEnabled", checked)}
              />
              <Toggle
                label="Staff Notification Enabled"
                checked={activeTemplate.staffNotificationEnabled}
                onChange={(checked) => updateDraft("staffNotificationEnabled", checked)}
              />
            </div>

            <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "14px", display: "grid", gap: "10px" }}>
              <h3 style={{ margin: 0 }}>Merge Fields</h3>
              <p style={{ margin: 0, color: "#6b7280" }}>
                Future in-app notifications can use this same token system.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {NOTIFICATION_MERGE_FIELDS.map((field) => (
                  <code
                    key={field}
                    style={{
                      background: "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      padding: "6px 8px",
                    }}
                  >
                    {`{{${field}}}`}
                  </code>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "14px", display: "grid", gap: "10px" }}>
              <h3 style={{ margin: 0 }}>Preview Sample Data</h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "8px",
                }}
              >
                {NOTIFICATION_MERGE_FIELDS.map((field) => (
                  <label key={field} style={{ display: "grid", gap: "4px" }}>
                    <span style={{ color: "#6b7280", fontSize: "12px" }}>{field}</span>
                    <input
                      type="text"
                      value={sampleData[field] || ""}
                      onChange={(event) =>
                        setSampleData((currentData) => ({
                          ...currentData,
                          [field]: event.target.value,
                        }))
                      }
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e7e5e4", paddingTop: "14px", display: "grid", gap: "8px" }}>
              <h3 style={{ margin: 0 }}>Rendered Preview</h3>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                Using current sample data and merge fields.
              </p>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px", background: "#f9fafb" }}>
                <strong>Email Subject</strong>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{preview.emailSubject}</p>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px", background: "#f9fafb" }}>
                <strong>Email Body</strong>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{preview.emailBody}</p>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px", background: "#f9fafb" }}>
                <strong>SMS Message</strong>
                <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{preview.smsMessage}</p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={saveTemplate}
                style={{
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "#0f766e",
                  color: "#ffffff",
                }}
              >
                Save Template
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
