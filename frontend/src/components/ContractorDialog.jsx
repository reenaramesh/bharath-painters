import { ContactRound } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import '../styles/contractor-people-ui.css';

export default function ContractorDialog({ title, description, icon = ContactRound, onClose, children, size = 'lg' }) {
  return <Dialog title={title} description={description} icon={icon} onClose={onClose}
    className="contractor-dialog" size={size} closeLabel="Close" bodyClassName="contractor-dialog-content">
    {children}
  </Dialog>;
}
