import { publicSiteMode, site } from "../config/site";
import { Icon, type IconName } from "./Icon";
import { useRouter } from "../router/Router";
import { Placeholder } from "./ui";

export function ContactDetails() {
  const { path } = useRouter();
  const mode = publicSiteMode(path);
  const c = site.contact;
  const bc = site.bnotContact;
  const items: { icon: IconName; label: string; value: string; href?: string }[] = [];
  if (mode === "bnot") {
    if (bc.mobile) items.push({ icon: "phone", label: "נייד", value: bc.mobile, href: `tel:${bc.mobile.replace(/[^\d+]/g, "")}` });
    if (bc.landline) items.push({ icon: "phone", label: "טלפון", value: bc.landline, href: `tel:${bc.landline.replace(/[^\d+]/g, "")}` });
    if (bc.whatsapp) items.push({ icon: "whatsapp", label: "וואטסאפ", value: "שליחת הודעה", href: `https://wa.me/${bc.whatsapp}` });
    if (site.social.facebook) items.push({ icon: "external", label: "פייסבוק", value: "עמוד בנות צילה", href: site.social.facebook });
    if (site.social.instagram) items.push({ icon: "external", label: "אינסטגרם", value: "@bnot_tzila", href: site.social.instagram });
  }
  if (mode !== "bnot") {
    if (c.phone) items.push({ icon: "phone", label: "טלפון", value: c.phone, href: `tel:${c.phone.replace(/[^\d+]/g, "")}` });
    if (c.whatsapp) items.push({ icon: "whatsapp", label: "וואטסאפ", value: "שליחת הודעה", href: `https://wa.me/${c.whatsapp}` });
    if (c.email) items.push({ icon: "mail", label: "מייל", value: c.email, href: `mailto:${c.email}` });
    if (c.address) items.push({ icon: "pin", label: "כתובת", value: c.address });
    if (c.hours) items.push({ icon: "clock", label: "שעות מענה", value: c.hours });
  }

  if (!items.length) {
    return (
      <Placeholder title="פרטי הקשר יפורסמו לאחר אישור" todo="site.contact">
        טלפון, וואטסאפ, מייל וכתובת - רק פרטים שהמוסדות אישרו לפרסום. בינתיים אפשר לפנות דרך הטופס.
      </Placeholder>
    );
  }

  return (
    <ul className="contact-list">
      {items.map((it) => (
        <li className="contact-item" key={it.label}>
          <span className="contact-item__icon">
            <Icon name={it.icon} />
          </span>
          <span>
            <span className="contact-item__label">{it.label}</span>
            {it.href ? (
              <a
                className="contact-item__value"
                href={it.href}
                {...(it.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {it.value}
              </a>
            ) : (
              <span className="contact-item__value">{it.value}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
