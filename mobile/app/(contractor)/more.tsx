import { DemoLabel, Heading, Screen, Section } from '../../src/components/ui';
import { ModuleGrid } from '../../src/components/ModuleGrid';
export default function More() { return <Screen><DemoLabel /><Heading title="Your workspace" subtitle="Every tool, within reach." /><Section title="All tools"><ModuleGrid /></Section></Screen>; }
