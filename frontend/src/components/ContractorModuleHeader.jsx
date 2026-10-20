import { ContactRound } from 'lucide-react';
import { PageHeader } from './ui';
import '../styles/contractor-people-ui.css';

export default function ContractorModuleHeader({ icon: Icon = ContactRound, eyebrow, title, description, actions }) {
  return <div className="contractor-module-header"><PageHeader eyebrow={eyebrow} title={<span className="contractor-module-heading">{Icon && <span className="contractor-module-icon" aria-hidden="true"><Icon size={24} strokeWidth={1.8} /></span>}<span>{title}</span></span>} description={description} actions={actions} /></div>;
}
