import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  MERGE_FIELDS,
  SAMPLE_MERGE_DATA,
  applyMergeFields,
  getNotificationTemplates,
  updateNotificationTemplate,
  resetNotificationTemplate,
  subscribeToNotificationTemplates,
} from "../lib/notificationTemplatesStore";

const NOTIFICATION_TYPE_LIST = Object.values(NOTIFICATION_TYPES);

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #d6d3d1",
  fontSize: "14px",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  minHeight: "120px",
  lineHeight: 1.55,
};

const labelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: 700,
  color: "#57534e",
  marginBottom: "5px",
  letterSpacing: "0.01em",
};

const sectionHeadingStyle = {
  margin: "0 0 14px",
  fontSize: "13px",
  fontWeight: 900,
  color: "#78716c",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

function MergeFieldChips({ onInsert }) {
  const [copiedKey, setCopiedKey] = useState(null);

  function handleCopy(key) {
    onInsert(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  return (
    <div>
      <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#78716c", fontWeight: 700 }}>
        Available merge fields — click to copy:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {MERGE_FIELDS.map((field) => {
          const copied = copiedKey === field.key;
          return (
            <button
              key={field.key}
              type="button"
              title={`Copy ${field.label}`}
              aria-label={copied ? `${field.label} copied` : `Copy merge field ${field.label}`}
              onClick={() => handleCopy(field.key)}
              style={{
                padding: "4px 9px",
                borderRadius: "6px",
                border: `1px solid ${copied ? "#bbf7d0" : "#d6d3d1"}`,
                background: copied ? "#dcfce7" : "#f5f5f4",
                color: copied ? "#166534" : "#44403c",
                fontSize: "12px",
                fontFamily: "monospace",
                cursor: "pointer",
                fontWeight: 600,
                transition: "background 0.15s, border-color 0.15s, color 0.15s",
              }}
            >
              {copied ? "✓ copied" : field.key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PreviewPane({ emailSubject, emailBody, smsMessage }) {
  const renderedSubject = applyMergeFields(emailSubject);
  const renderedBody = applyMergeFields(emailBody);
  const renderedSms = applyMergeFields(smsMessage);

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <div>
        <p style={sectionHeadingStyle}>Email Preview</p>
        <div
          style={{
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              background: "#f8fafc",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 700 }}>
              Subject:{" "}
            </span>
            <span style={{ fontSize: "13px", color: "#171717", fontWeight: 600 }}>
              {renderedSubject || <em style={{ color: "#94a3b8" }}>No subject</em>}
            </span>
          </div>
          <div
            style={{
              padding: "16px",
              background: "#ffffff",
              fontSize: "14px",
              color: "#374151",
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              minHeight: "80px",
            }}
          >
            {renderedBody || <em style={{ color: "#94a3b8" }}>No email body</em>}
          </div>
        </div>
      </div>

      <div>
        <p style={sectionHeadingStyle}>SMS Preview</p>
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            background: "#ffffff",
            fontSize: "14px",
            color: "#374151",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            minHeight: "56px",
          }}
        >
          {renderedSms || <em style={{ color: "#94a3b8" }}>No SMS body</em>}
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#94a3b8" }}>
          {renderedSms.length} characters
        </p>
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderRadius: "10px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
          Sample data used in preview:
        </p>
        <div style={{ display: "grid", gap: "3px" }}>
          {MERGE_FIELDS.map((field) => (
            <div key={field.key} style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
              <code style={{ color: "#0f766e", fontFamily: "monospace", flexShrink: 0 }}>
                {field.key}
              </code>
              <span style={{ color: "#64748b" }}>→</span>
              <span style={{ color: "#374151" }}>{SAMPLE_MERGE_DATA[field.key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ template, onSave, onReset, saving }) {
  const [draft, setDraft] = useState(() => ({ ...template }));
  const [activeTab, setActiveTab] = useState("edit");
  const [saveStatus, setSaveStatus] = useState(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const isDirty =
    draft.name !== template.name ||
    draft.emailSubject !== template.emailSubject ||
    draft.emailBody !== template.emailBody ||
    draft.smsMessage !== template.smsMessage;

  function setField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function handleInsertMergeField(field) {
    navigator.clipboard?.writeText(field).catch(() => {});
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveStatus(null);
    try {
      await onSave(template.type, draft);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("error");
    }
  }

  async function handleResetConfirmed() {
    setResetConfirmOpen(false);
    try {
      const resetTemplate = await onReset(template.type);
      setDraft({ ...resetTemplate });
      setSaveStatus("reset");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("error");
    }
  }

  const tabStyle = (tab) => ({
    padding: "8px 16px",
    borderRadius: "8px 8px 0 0",
    border: "1px solid",
    borderBottom: activeTab === tab ? "1px solid #ffffff" : "1px solid #e2e8f0",
    borderColor: activeTab === tab ? "#e2e8f0" : "transparent",
    background: activeTab === tab ? "#ffffff" : "transparent",
    color: activeTab === tab ? "#171717" : "#64748b",
    fontWeight: activeTab === tab ? 700 : 600,
    fontSize: "13px",
    cursor: activeTab === tab ? "default" : "pointer",
    marginBottom: "-1px",
    position: "relative",
  });

  return (
    <form onSubmit={handleSave} style={{ display: "grid", gap: "0" }}>
      <div style={{ display: "flex", gap: "4px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
        <button type="button" style={tabStyle("edit")} onClick={() => setActiveTab("edit")}>
          Edit Template
        </button>
        <button type="button" style={tabStyle("preview")} onClick={() => setActiveTab("preview")}>
          Preview
        </button>
      </div>

      {activeTab === "edit" ? (
        <div style={{ display: "grid", gap: "20px" }}>
          <div>
            <label style={labelStyle} htmlFor={`name-${template.type}`}>
              Template Name
            </label>
            <input
              id={`name-${template.type}`}
              type="text"
              value={draft.name}
              onChange={(e) => setField("name", e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div>
            <p style={sectionHeadingStyle}>Email</p>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor={`emailSubject-${template.type}`}>
                  Email Subject
                </label>
                <input
                  id={`emailSubject-${template.type}`}
                  type="text"
                  value={draft.emailSubject}
                  onChange={(e) => setField("emailSubject", e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`emailBody-${template.type}`}>
                  Email Body
                </label>
                <textarea
                  id={`emailBody-${template.type}`}
                  value={draft.emailBody}
                  onChange={(e) => setField("emailBody", e.target.value)}
                  style={{ ...textareaStyle, minHeight: "180px" }}
                />
              </div>
            </div>
          </div>

          <div>
            <p style={sectionHeadingStyle}>SMS</p>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle} htmlFor={`smsMessage-${template.type}`}>
                  SMS Body
                </label>
                <textarea
                  id={`smsMessage-${template.type}`}
                  value={draft.smsMessage}
                  onChange={(e) => setField("smsMessage", e.target.value)}
                  style={textareaStyle}
                />
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#94a3b8" }}>
                  {draft.smsMessage.length} characters
                </p>
              </div>
            </div>
          </div>

          <MergeFieldChips onInsert={handleInsertMergeField} />
        </div>
      ) : (
        <PreviewPane
          emailSubject={draft.emailSubject}
          emailBody={draft.emailBody}
          smsMessage={draft.smsMessage}
        />
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "22px",
          paddingTop: "16px",
          borderTop: "1px solid #e2e8f0",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={saving || !isDirty}
            style={{
              padding: "10px 18px",
              borderRadius: "10px",
              border: "none",
              background: isDirty ? "#0f766e" : "#d6d3d1",
              color: isDirty ? "#ffffff" : "#a8a29e",
              fontWeight: 700,
              fontSize: "14px",
              cursor: isDirty && !saving ? "pointer" : "default",
            }}
          >
            {saving ? "Saving…" : "Save Template"}
          </button>

          {resetConfirmOpen ? (
            <div
              role="alert"
              aria-label="Confirm reset to default"
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #fecaca",
                background: "#fef2f2",
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "13px", color: "#7f1d1d", fontWeight: 600 }}>
                Reset to default? This will discard your changes.
              </span>
              <button
                type="button"
                onClick={handleResetConfirmed}
                style={{
                  padding: "5px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#dc2626",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Yes, reset
              </button>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "8px",
                  border: "1px solid #fca5a5",
                  background: "#ffffff",
                  color: "#57534e",
                  fontWeight: 700,
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#57534e",
                fontWeight: 700,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Reset to Default
            </button>
          )}
        </div>

        {saveStatus === "saved" && (
          <span style={{ color: "#166534", fontSize: "13px", fontWeight: 700 }}>
            ✓ Template saved
          </span>
        )}
        {saveStatus === "reset" && (
          <span style={{ color: "#166534", fontSize: "13px", fontWeight: 700 }}>
            ✓ Reset to default
          </span>
        )}
        {saveStatus === "error" && (
          <span style={{ color: "#b91c1c", fontSize: "13px", fontWeight: 700 }}>
            Failed to save. Please try again.
          </span>
        )}
      </div>
    </form>
  );
}

export default function NotificationTemplates() {
  const [templates, setTemplates] = useState(() => getNotificationTemplates());
  const [expandedType, setExpandedType] = useState(null);
  const [saving, setSaving] = useState(false);

  // Re-sync templates when Supabase hydration completes or another device saves
  useEffect(() => {
    return subscribeToNotificationTemplates(() => {
      setTemplates(getNotificationTemplates());
    });
  }, []);

  const handleSave = useCallback(async (type, updates) => {
    setSaving(true);
    try {
      const updated = updateNotificationTemplate(type, updates);
      setTemplates((prev) => ({ ...prev, [type]: updated }));
    } finally {
      setSaving(false);
    }
  }, []);

  const handleReset = useCallback(async (type) => {
    setSaving(true);
    try {
      const reset = resetNotificationTemplate(type);
      setTemplates((prev) => ({ ...prev, [type]: reset }));
      return reset;
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <div style={{ padding: "32px", maxWidth: "860px" }}>
      <div style={{ marginBottom: "28px" }}>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "12px",
            fontWeight: 900,
            color: "#78716c",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Settings
        </p>
        <h1 style={{ margin: "0 0 8px", fontSize: "24px", color: "#171717" }}>
          Notification Templates
        </h1>
        <p style={{ margin: 0, color: "#57534e", fontSize: "14px", lineHeight: 1.55 }}>
          Manage the message content used for customer and staff notifications.
          Templates are stored in Supabase and synchronized across devices on page load. Use merge
          fields to personalize each message.
        </p>
        <nav style={{ display: "flex", gap: "12px", marginTop: "14px" }}>
          <Link to="/admin/settings/notifications/policy">Notification Policy</Link>
          <Link to="/admin/settings/notifications/activity">Activity</Link>
        </nav>
      </div>

      <div
        style={{
          padding: "12px 16px",
          borderRadius: "12px",
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          marginBottom: "28px",
        }}
      >
        <p style={{ margin: 0, fontSize: "13px", color: "#9a3412", lineHeight: 1.5 }}>
          <strong>Content only.</strong> Configure enablement, audiences, automatic delivery,
          channels, and template assignments in Notification Policy.
        </p>
      </div>

      <div style={{ display: "grid", gap: "10px" }}>
        {NOTIFICATION_TYPE_LIST.map((type) => {
          const template = templates[type];
          const label = NOTIFICATION_TYPE_LABELS[type];
          const isExpanded = expandedType === type;
          return (
            <div
              key={type}
              style={{
                borderRadius: "14px",
                border: isExpanded ? "1px solid #cbd5e1" : "1px solid #e2e8f0",
                background: isExpanded ? "#f8fafc" : "#ffffff",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedType(isExpanded ? null : type)}
                aria-expanded={isExpanded}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "15px", color: "#171717" }}>
                    {template.name || label}
                  </strong>
                  <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>Message content</span>
                </div>
                <span
                  aria-hidden="true"
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "999px",
                    border: "1px solid #d6d3d1",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#44403c",
                    fontSize: "13px",
                    fontWeight: 900,
                    background: "#ffffff",
                    flexShrink: 0,
                  }}
                >
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {isExpanded && (
                <div
                  style={{
                    padding: "0 16px 20px",
                    borderTop: "1px solid #e2e8f0",
                    marginTop: "-1px",
                    paddingTop: "20px",
                  }}
                >
                  <TemplateEditor
                    key={type}
                    template={template}
                    onSave={handleSave}
                    onReset={handleReset}
                    saving={saving}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
