"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      LinkExtension.configure({ openOnClick: false, autolink: true }),
      ImageExtension.configure({ HTMLAttributes: { class: "rounded-md" } }),
      Placeholder.configure({ placeholder: placeholder ?? "Нийтлэлээ энд бичнэ үү…" }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-headings:font-extrabold prose-h2:text-[1.4rem] prose-h3:text-[1.15rem] prose-p:my-3 prose-img:my-4 max-w-none min-h-[320px] focus:outline-none text-ink",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? "Зураг байршуулахад алдаа гарлаа");
        return;
      }
      editor?.chain().focus().setImage({ src: json.url }).run();
    } catch {
      alert("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setUploading(false);
    }
  };

  const setLink = () => {
    if (!editor) return;
    const prevUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Холбоосын хаяг (URL):", prevUrl ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  if (!editor) return null;

  return (
    <div className="border border-line-2 rounded-md bg-surface overflow-hidden">
      <Toolbar editor={editor} onSetLink={setLink} onPickImage={() => fileInputRef.current?.click()} uploading={uploading} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) uploadImage(file);
        }}
      />
      <div className="px-4 py-3 max-h-[520px] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  onSetLink,
  onPickImage,
  uploading,
}: {
  editor: Editor;
  onSetLink: () => void;
  onPickImage: () => void;
  uploading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line-2 bg-bg-soft px-2 py-1.5">
      <ToolButton label="Бүдүүн" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>Б</b>
      </ToolButton>
      <ToolButton label="Налуу" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <i>Т</i>
      </ToolButton>
      <ToolButton label="Доогуур зураас" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <u>Д</u>
      </ToolButton>
      <ToolButton label="Дундуур зураас" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <s>С</s>
      </ToolButton>

      <Divider />

      <ToolButton
        label="Гарчиг 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolButton>
      <ToolButton
        label="Гарчиг 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolButton>

      <Divider />

      <ToolButton label="Жагсаалт" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •≡
      </ToolButton>
      <ToolButton
        label="Дугаарласан жагсаалт"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolButton>
      <ToolButton label="Ишлэл" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        &ldquo;&rdquo;
      </ToolButton>

      <Divider />

      <ToolButton label="Холбоос" active={editor.isActive("link")} onClick={onSetLink}>
        <IconLink className="w-4 h-4" />
      </ToolButton>
      <ToolButton label="Зураг оруулах" active={false} onClick={onPickImage} disabled={uploading}>
        {uploading ? <span className="text-[.7rem]">…</span> : <IconImage className="w-4 h-4" />}
      </ToolButton>

      <Divider />

      <ToolButton label="Буцаах" active={false} onClick={() => editor.chain().focus().undo().run()}>
        <IconUndo className="w-4 h-4" />
      </ToolButton>
      <ToolButton label="Дахих" active={false} onClick={() => editor.chain().focus().redo().run()}>
        <IconRedo className="w-4 h-4" />
      </ToolButton>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-6 bg-line-2 mx-1" />;
}

function ToolButton({
  label,
  active,
  onClick,
  disabled,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-[32px] h-8 px-2 rounded-xs grid place-items-center text-[.9rem] font-bold transition-colors disabled:opacity-40 ${
        active ? "bg-blue text-white" : "text-ink-2 hover:bg-blue-soft hover:text-blue-strong"
      }`}
    >
      {children}
    </button>
  );
}

function IconLink(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M9 15l6-6" strokeLinecap="round" />
      <path d="M11 6l1-1a4 4 0 015.5 5.5l-1.5 1.5" strokeLinecap="round" />
      <path d="M13 18l-1 1a4 4 0 01-5.5-5.5l1.5-1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconImage(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <rect x={3} y={4} width={18} height={16} rx={2} />
      <circle cx={8.5} cy={9.5} r={1.5} fill="currentColor" stroke="none" />
      <path d="M21 16l-5.5-5.5a2 2 0 00-2.8 0L4 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUndo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M8 7L4 11l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 11h11a5 5 0 010 10h-2" strokeLinecap="round" />
    </svg>
  );
}

function IconRedo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path d="M16 7l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 11H9a5 5 0 000 10h2" strokeLinecap="round" />
    </svg>
  );
}
