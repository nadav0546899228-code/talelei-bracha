import { useState } from "react";
import { EventCard } from "../components/Content";
import { PageHero, Placeholder } from "../components/ui";
import { events } from "../data/content";

export default function Events() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.start).getTime() >= now).sort((a, b) => a.start.localeCompare(b.start));
  const past = events.filter((e) => new Date(e.start).getTime() < now).sort((a, b) => b.start.localeCompare(a.start));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <>
      <PageHero title="אירועים" lead="אירועים קרובים, הרשמה ופרטי הגעה - ואירועים שהתקיימו." />
      <section className="section">
        <div className="container">
          <div className="tabs" role="tablist" aria-label="סוג אירועים">
            <button type="button" role="tab" id="tab-up" aria-selected={tab === "upcoming"} aria-controls="events-panel" onClick={() => setTab("upcoming")}>
              קרובים ({upcoming.length})
            </button>
            <button type="button" role="tab" id="tab-past" aria-selected={tab === "past"} aria-controls="events-panel" onClick={() => setTab("past")}>
              שהתקיימו ({past.length})
            </button>
          </div>
          <div id="events-panel" role="tabpanel" aria-labelledby={tab === "upcoming" ? "tab-up" : "tab-past"}>
            {list.length ? (
              <div className="grid grid--2">
                {list.map((e) => (
                  <EventCard key={e.id} e={e} past={tab === "past"} />
                ))}
              </div>
            ) : (
              <Placeholder title={tab === "upcoming" ? "אין כרגע אירועים מתוכננים" : "אין עדיין אירועי עבר"} />
            )}
          </div>
          <div style={{ marginTop: 34 }}>
            <Placeholder title="האירועים המוצגים הם דוגמה" todo="data.events">
              אירוע בתשלום יחובר לקישור סליקה חיצוני ומאובטח. Waze ומפות יופיעו כשתוזן כתובת.
            </Placeholder>
          </div>
        </div>
      </section>
    </>
  );
}
