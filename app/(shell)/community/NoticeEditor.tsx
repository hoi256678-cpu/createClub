"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { resizeImageFile, MAX_SOURCE_FILE_BYTES } from "./imageUtils";

const MAX_IMAGES = 5;
const MAX_IMAGE_LEN = 2_000_000;

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export default function NoticeEditor({ value, onChange }: Props) {
  const [imageError, setImageError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        // @tiptap/starter-kit v3 bundles its own Link extension; disable it
        // here since we configure Link ourselves below (avoids a duplicate
        // "link" extension registration).
        link: false,
      }),
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  function countImages() {
    return (editor!.getHTML().match(/<img /g) || []).length;
  }

  function toggleLink() {
    const prevUrl = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL을 입력하세요", prevUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    if (countImages() >= MAX_IMAGES) {
      setImageError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요`);
      return;
    }
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      setImageError("이미지 용량이 너무 커요 (10MB 이하로 선택해주세요)");
      return;
    }
    try {
      const resized = await resizeImageFile(file);
      if (resized.length > MAX_IMAGE_LEN) {
        setImageError("이미지 용량이 너무 커요");
        return;
      }
      editor!.chain().focus().setImage({ src: resized }).run();
    } catch {
      setImageError("이미지를 처리하지 못했어요");
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex gap-1 border-b border-border p-1.5">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded px-2 py-1 text-xs font-bold ${
            editor.isActive("bold") ? "bg-primary-light text-primary-dark" : "text-text-muted"
          }`}
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded px-2 py-1 text-xs font-bold italic ${
            editor.isActive("italic") ? "bg-primary-light text-primary-dark" : "text-text-muted"
          }`}
        >
          I
        </button>
        <button
          type="button"
          onClick={toggleLink}
          className={`rounded px-2 py-1 text-xs font-bold ${
            editor.isActive("link") ? "bg-primary-light text-primary-dark" : "text-text-muted"
          }`}
        >
          🔗
        </button>
        <label className="cursor-pointer rounded px-2 py-1 text-xs font-bold text-text-muted hover:bg-primary-light">
          📷
          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </label>
      </div>
      <EditorContent
        editor={editor}
        className="notice-body min-h-[120px] px-3 py-2 text-sm text-text-2 [&_.ProseMirror]:outline-none"
      />
      {imageError && <p className="px-3 pb-2 text-xs font-semibold text-danger">{imageError}</p>}
    </div>
  );
}
