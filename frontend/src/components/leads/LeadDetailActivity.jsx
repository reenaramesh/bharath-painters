import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui";
import { localDateTime } from "./lead-format";
import { stageLabel } from "../../utils/opportunityOptions";

export default function LeadDetailActivity({ item }) {
  const [visible, setVisible] = useState(10);
  const events = [...(item.timeline || [])].sort((left, right) => new Date(right.at) - new Date(left.at));
  const stages = new Map((item.history || []).map(event => [`stage-${event.id}`, event]));
  const followups = new Map((item.follow_ups || []).map(task => [`followup-${task.id}`, task]));
  return <section className="lead-panel lead-detail-section" aria-label="Activity history">
    <h2>Activity</h2>
    {events.length ? <>
      <ol className="lead-timeline">{events.slice(0, visible).map(event => {
        const transition = stages.get(event.key);
        const actor = event.actor_name || followups.get(event.key)?.performed_by_name;
        return <li key={event.key}><p className="font-semibold">{event.title}</p>
          {transition?.from_stage && transition.from_stage !== transition.to_stage && <p className="lead-activity-transition"><span>{stageLabel(transition.from_stage)}</span><ArrowRight size={13} aria-hidden="true" /><span className="sr-only">to</span><span>{stageLabel(transition.to_stage)}</span></p>}
          {event.note && <p className="lead-activity-note">{event.note}</p>}
          <p className="lead-muted">{actor && <span>{actor} · </span>}<time dateTime={event.at}>{localDateTime(event.at)}</time></p>
        </li>;
      })}</ol>
      {events.length > visible && <Button variant="secondary" onClick={() => setVisible(count => count + 10)}>Show more</Button>}
    </> : <p className="lead-muted mt-3">Calls, updates and progress will appear here.</p>}
  </section>;
}
