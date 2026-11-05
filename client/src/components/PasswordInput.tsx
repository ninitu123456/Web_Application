import { useState, type InputHTMLAttributes } from "react";
import { Input } from "./ui";
export function PasswordInput(
  props: InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <Input {...props} type={visible ? "text" : "password"} />
      <button
        className="password-toggle"
        type="button"
        aria-label={`${visible ? "Ẩn" : "Hiện"} ${props.label.toLowerCase()}`}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Ẩn" : "Hiện"}
      </button>
    </div>
  );
}
