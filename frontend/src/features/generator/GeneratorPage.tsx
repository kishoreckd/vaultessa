import { PageHeader } from '@/components/common/page';
import { Card, CardContent } from '@/components/ui/card';
import { GeneratorPanel } from './GeneratorPanel';

export function GeneratorPage() {
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader title="Password generator" description="Generated securely on this device." />
      <Card>
        <CardContent>
          <GeneratorPanel />
        </CardContent>
      </Card>
    </div>
  );
}
