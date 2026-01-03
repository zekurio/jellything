import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { configManager } from "@/lib/config";

export default function ConfigErrorPage() {
  const error = configManager.getError();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-red-600">
            Configuration Error
          </CardTitle>
          <CardDescription>
            There was a problem loading the configuration file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive rounded-md p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {error}
              </pre>
            </div>
          )}
          <div className="text-muted-foreground text-sm">
            <p>Please check your configuration file and fix any errors.</p>
            <p className="mt-2">
              The configuration file location is:{" "}
              <code className="bg-muted rounded px-1">
                {process.env.CONFIG_PATH ?? "./config.json"}
              </code>
            </p>
            <p className="mt-2">
              After fixing the configuration, restart the server.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
