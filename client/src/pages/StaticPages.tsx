import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { RobotMascot } from "../components/Illustrations";
import { Input, Select, Textarea } from "../components/ui";
import { useAuth } from "../lib/auth";
import { api, errorText } from "../lib/api";
import type { ContactTopic } from "../lib/types";

// Support inbox for the contact form; set VITE_SUPPORT_EMAIL when deploying.
const SUPPORT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL || "24521911@gm.uit.edu.vn";

export function AboutPage() {
  return (
    <section className="page-section static-page">
      <div className="about-hero">
        <div>
          <div className="eyebrow">GIỚI THIỆU</div>
          <h1>Mỗi món đồ đều xứng đáng được về đúng chủ.</h1>
          <p>
            FindIt là dự án của sinh viên UIT, giúp kết nối người mất đồ và
            người nhặt được trong khuôn viên trường nhanh, an toàn và minh bạch.
          </p>
          <div className="actions">
            <Link className="button primary" to="/kham-pha">
              Khám phá đồ thất lạc
            </Link>
            <Link className="button secondary" to="/dang-bai">
              Đăng tin
            </Link>
          </div>
        </div>
        <div className="about-art glass" aria-hidden="true">
          <RobotMascot />
        </div>
      </div>
      <div className="value-grid">
        {[
          [
            "shield",
            "An toàn",
            "Chỉ tài khoản email trường. Người nhận phải chứng minh quyền sở hữu trước khi được trao đồ.",
          ],
          [
            "sparkle",
            "Thông minh",
            "Hệ thống so khớp hình ảnh và thông tin giữa tin Bị mất và Nhặt được, rồi gợi ý cho chủ tin.",
          ],
          [
            "users",
            "Cộng đồng",
            "Mỗi lần trao trả thành công là một lần sinh viên giúp sinh viên.",
          ],
        ].map(([icon, title, text]) => (
          <article className="v3-card value-card" key={title}>
            <span className="how-icon">
              <Icon name={icon as "shield"} width="24" height="24" />
            </span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <section
        className="v3-card rules"
        id="quy-tac"
        aria-labelledby="rules-title"
      >
        <h2 id="rules-title">Quy tắc cộng đồng</h2>
        <ul>
          {[
            "Không đăng thông tin cá nhân nhạy cảm (số CCCD, số tài khoản) lên ảnh hoặc mô tả.",
            "Không yêu cầu tiền chuộc hay chuyển khoản trước khi trả đồ.",
            "Gặp mặt ở nơi công cộng trong trường khi trao đồ.",
            "Đóng tin khi đã tìm thấy hoặc đã trả đồ.",
            "Báo cáo ngay tin đăng hoặc tài khoản có dấu hiệu lừa đảo.",
            "Chỉ gửi yêu cầu nhận lại khi chắc chắn đó là đồ của bạn.",
          ].map((rule) => (
            <li key={rule}>
              <Icon name="check" width="20" height="20" strokeWidth="2.5" />
              {rule}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

const TOPICS: [ContactTopic, string][] = [
  ["GENERAL", "Câu hỏi / góp ý chung"],
  ["ITEM", "Bài đăng hoặc trao đồ"],
  ["REPORT", "Báo lỗi / vi phạm"],
  ["ACCOUNT", "Tài khoản"],
  ["OTHER", "Khác"],
];

export function ContactPage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [topic, setTopic] = useState<ContactTopic>("GENERAL");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!user) return;
    setName((value) => value || user.fullName);
    setEmail((value) => value || user.email);
  }, [user]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Vui lòng nhập họ tên.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = "Email chưa hợp lệ.";
    if (body.trim().length < 20) next.body = "Nội dung tối thiểu 20 ký tự.";
    if (link.trim() && !/^https?:\/\/\S+$/.test(link.trim()))
      next.link = "Đường dẫn cần bắt đầu bằng http:// hoặc https://";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFailure("");
    try {
      await api("/contact", {
        method: "POST",
        body: {
          fullName: name.trim(),
          email: email.trim(),
          topic,
          body: body.trim(),
          ...(link.trim() ? { itemUrl: link.trim() } : {}),
        },
      });
      setSent(true);
      setBody("");
      setLink("");
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page-section static-page contact-page">
      <div>
        <div className="eyebrow">LIÊN HỆ</div>
        <h1>Cần hỗ trợ? Nhắn cho chúng mình.</h1>
        <p className="page-lead">
          Báo lỗi, góp ý tính năng hoặc tranh chấp khi trao đồ.
        </p>
        <div className="contact-list">
          {[
            ["mail", "Email", SUPPORT_EMAIL],
            [
              "pin",
              "Địa chỉ",
              "Trường Đại học Công nghệ Thông tin – ĐHQG TP.HCM",
            ],
            ["clock", "Phản hồi", "Trong giờ hành chính, thứ 2 – thứ 6"],
          ].map(([icon, label, value]) => (
            <div className="v3-card contact-item" key={label}>
              <span className="fact-icon">
                <Icon name={icon as "mail"} />
              </span>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
      <form className="v3-card contact-form" onSubmit={submit} noValidate>
        <h2>Gửi tin nhắn</h2>
        <div className="two">
          <Input
            label="Họ và tên *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <Input
            label="Email *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
        </div>
        <Select
          label="Chủ đề *"
          value={topic}
          onChange={(e) => setTopic(e.target.value as ContactTopic)}
        >
          {TOPICS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Textarea
          label="Nội dung *"
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={errors.body}
          placeholder="Mô tả vấn đề của bạn…"
        />
        <Input
          label="Đường dẫn tin liên quan"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          error={errors.link}
          placeholder="https://…/do-vat/…"
        />
        {sent && (
          <p className="notice success" role="status">
            <Icon name="check" /> Đã gửi! Ban quản trị sẽ phản hồi qua email{" "}
            {email.trim()}.
          </p>
        )}
        {failure && (
          <p className="inline-error" role="alert">
            {failure}
          </p>
        )}
        <button className="button primary" type="submit" disabled={busy}>
          <Icon name="send" /> {busy ? "Đang gửi…" : "Gửi tin nhắn"}
        </button>
        <p className="fine">Tin nhắn được lưu vào hộp thư hỗ trợ của FindIt.</p>
      </form>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="page-section not-found">
      <div>
        <div className="nf-code gradient-text">404</div>
        <h1>Trang này cũng bị thất lạc rồi</h1>
        <p className="page-lead">
          Đường dẫn không tồn tại hoặc tin đăng đã bị gỡ. Thử tìm lại từ trang
          Khám phá nhé.
        </p>
        <div className="actions">
          <Link className="button primary" to="/">
            Về trang chủ
          </Link>
          <Link className="button secondary" to="/kham-pha">
            Mở Khám phá
          </Link>
        </div>
      </div>
      <RobotMascot className="nf-robot" />
    </section>
  );
}
