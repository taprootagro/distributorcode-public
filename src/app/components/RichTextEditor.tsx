import React, { useRef, useCallback, useEffect, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, ImagePlus, Undo2, Redo2, RemoveFormatting, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

/**
 * Clean pasted HTML from Word / Google Docs:
 * - Remove <style>, <script>, <meta>, <xml> tags
 * - Strip mso-* and class attributes
 * - Keep structural tags (p, h1-h6, ul, ol, li, br, img, strong, em, u, a, table, tr, td, th, blockquote, span)
 * - Convert Word-style lists (<p style="mso-list...">)  to proper <li>
 */
function cleanWordHtml(raw: string): string {
  let html = raw;

  // Remove comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Remove <style>, <script>, <xml>, <o:p>, <meta> blocks
  html = html.replace(/<(style|script|xml|meta|link|title|head)[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<\/?(style|script|xml|meta|link|title|head|html|body|o:\w+|v:\w+|w:\w+)[^>]*>/gi, "");

  // Remove class attributes (Word adds tons of MsoNormal etc.)
  html = html.replace(/\s*class="[^"]*"/gi, "");

  // Remove mso-* styles but keep other inline styles
  html = html.replace(/\s*style="([^"]*)"/gi, (_, styles: string) => {
    const cleaned = styles
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => {
        if (!s) return false;
        // Remove Word-specific styles
        if (/^mso-/i.test(s)) return false;
        if (/^tab-stops/i.test(s)) return false;
        if (/^font-family/i.test(s)) return false; // let CSS handle fonts
        return true;
      })
      .join("; ");
    return cleaned ? ` style="${cleaned}"` : "";
  });

  // Remove empty spans
  html = html.replace(/<span\s*>([^<]*)<\/span>/gi, "$1");

  // Collapse excessive whitespace / line breaks
  html = html.replace(/(\s*\n\s*)+/g, "\n");

  // Remove empty paragraphs (but keep <br> / &nbsp; ones for spacing)
  html = html.replace(/<p[^>]*>\s*<\/p>/gi, "");

  return html.trim();
}

/**
 * Convert image File (from paste / drop) to base64 data URI
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function RichTextEditor({ label, value, onChange, placeholder, minHeight = "200px" }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Sync external value → editor (only when value truly changes from outside)
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
      setIsEmpty(!value);
    }
  }, [value]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const textOnly = editorRef.current.innerText.trim();
    setIsEmpty(!textOnly && !html.includes("<img"));
    isInternalChange.current = true;
    onChange(html);
  }, [onChange]);

  // --- Paste handler ---
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;

    // Check for pasted images (screenshots, drag files)
    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const dataUri = await fileToBase64(file);
          document.execCommand("insertHTML", false, `<img src="${dataUri}" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;" />`);
          emitChange();
        }
        return;
      }
    }

    // Check for HTML content (Word, Google Docs, etc.)
    const htmlData = clipboardData.getData("text/html");
    if (htmlData) {
      e.preventDefault();
      const cleaned = cleanWordHtml(htmlData);
      document.execCommand("insertHTML", false, cleaned);
      emitChange();
      return;
    }

    // Plain text fallback — let browser handle naturally
  }, [emitChange]);

  // --- Drop handler (for drag-and-drop images) ---
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      e.preventDefault();
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith("image/")) {
          const dataUri = await fileToBase64(files[i]);
          document.execCommand("insertHTML", false, `<img src="${dataUri}" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;" />`);
        }
      }
      emitChange();
    }
  }, [emitChange]);

  // --- Toolbar commands ---
  const exec = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    emitChange();
  }, [emitChange]);

  const insertImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        const dataUri = await fileToBase64(file);
        editorRef.current?.focus();
        document.execCommand("insertHTML", false, `<img src="${dataUri}" style="max-width: 100%; height: auto; margin: 8px 0; border-radius: 8px;" />`);
        emitChange();
      }
    };
    input.click();
  }, [emitChange]);

  const ToolButton = ({ onClick, title, children, className = "" }: { onClick: () => void; title: string; children: React.ReactNode; className?: string }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // prevent focus loss
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded hover:bg-gray-200 active:bg-gray-300 transition-colors text-gray-600 ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
          <ToolButton onClick={() => exec("bold")} title="Bold">
            <Bold className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("italic")} title="Italic">
            <Italic className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("underline")} title="Underline">
            <Underline className="w-4 h-4" />
          </ToolButton>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <ToolButton onClick={() => exec("justifyLeft")} title="Align Left">
            <AlignLeft className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("justifyCenter")} title="Align Center">
            <AlignCenter className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("justifyRight")} title="Align Right">
            <AlignRight className="w-4 h-4" />
          </ToolButton>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <ToolButton onClick={() => exec("insertUnorderedList")} title="Bullet List">
            <List className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("insertOrderedList")} title="Numbered List">
            <ListOrdered className="w-4 h-4" />
          </ToolButton>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <ToolButton onClick={insertImage} title="Insert Image">
            <ImagePlus className="w-4 h-4" />
          </ToolButton>

          <div className="w-px h-5 bg-gray-300 mx-1" />

          <ToolButton onClick={() => exec("undo")} title="Undo">
            <Undo2 className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("redo")} title="Redo">
            <Redo2 className="w-4 h-4" />
          </ToolButton>
          <ToolButton onClick={() => exec("removeFormat")} title="Clear Formatting">
            <RemoveFormatting className="w-4 h-4" />
          </ToolButton>
        </div>

        {/* Editable Area */}
        <div className="relative">
          {isEmpty && placeholder && (
            <div className="absolute top-0 inset-x-0 px-3 py-2 text-gray-400 text-sm pointer-events-none select-none">
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={emitChange}
            onPaste={handlePaste}
            onDrop={handleDrop}
            className="px-3 py-2 text-sm text-gray-800 outline-none overflow-auto rich-editor-content"
            style={{ minHeight }}
          />
        </div>
      </div>
    </div>
  );
}
