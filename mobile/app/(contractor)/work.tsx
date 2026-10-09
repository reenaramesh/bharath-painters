import { DemoLabel, Heading, Screen, Section } from '../../src/components/ui';
import { ModuleGrid } from '../../src/components/ModuleGrid';
export default function Work() { return <Screen><DemoLabel /><Heading title="Your work" subtitle="From the first enquiry to the final finish." /><Section title="Sales & estimates"><ModuleGrid ids={['leads', 'quotations', 'measurements']} /></Section><Section title="Sites & delivery"><ModuleGrid ids={['properties', 'projects', 'schedules']} /></Section><Section title="Money matters"><ModuleGrid ids={['payments']} /></Section></Screen>; }
