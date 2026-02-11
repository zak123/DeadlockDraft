import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export function ApiDocs() {
  const navigate = useNavigate();
  const baseUrl = API_BASE_URL || window.location.origin;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-deadlock-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-xl font-bold hover:text-amber transition-colors"
          >
            Deadlock Draft
          </button>
          <span className="text-sm text-deadlock-muted">API Documentation</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4">
        <div className="container mx-auto max-w-3xl space-y-8 py-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Public API</h2>
            <p className="text-deadlock-muted">
              Create lobbies programmatically. No authentication required.
            </p>
          </div>

          {/* Create Lobby Endpoint */}
          <div className="card p-6 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs font-mono font-bold rounded">
                  POST
                </span>
                <code className="text-lg font-mono">/api/external/lobbies</code>
              </div>
              <p className="text-deadlock-muted">
                Creates a new lobby. API-created lobbies have no host, so settings cannot
                be changed after creation. Players can join via the returned URL or lobby code.
              </p>
            </div>

            {/* Rate Limiting */}
            <div>
              <h3 className="text-sm font-semibold text-deadlock-muted uppercase tracking-wider mb-2">
                Rate Limiting
              </h3>
              <p className="text-sm">
                10 requests per minute per IP address. Rate limit headers are included in every response.
              </p>
            </div>

            {/* Request Body */}
            <div>
              <h3 className="text-sm font-semibold text-deadlock-muted uppercase tracking-wider mb-3">
                Request Body
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-deadlock-border">
                      <th className="text-left py-2 pr-4 font-medium">Field</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-left py-2 pr-4 font-medium">Required</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deadlock-border">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">api_identifier</td>
                      <td className="py-2 pr-4">string</td>
                      <td className="py-2 pr-4 text-green-400">Yes</td>
                      <td className="py-2 text-deadlock-muted">Your application identifier (1-100 chars)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">name</td>
                      <td className="py-2 pr-4">string</td>
                      <td className="py-2 pr-4 text-deadlock-muted">No</td>
                      <td className="py-2 text-deadlock-muted">Lobby name (default: "API Lobby")</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">maxPlayers</td>
                      <td className="py-2 pr-4">number</td>
                      <td className="py-2 pr-4 text-deadlock-muted">No</td>
                      <td className="py-2 text-deadlock-muted">Max players, 2-24 (default: 12)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">allowTeamChange</td>
                      <td className="py-2 pr-4">boolean</td>
                      <td className="py-2 pr-4 text-deadlock-muted">No</td>
                      <td className="py-2 text-deadlock-muted">Allow players to change teams (default: true)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">matchConfig</td>
                      <td className="py-2 pr-4">object</td>
                      <td className="py-2 pr-4 text-deadlock-muted">No</td>
                      <td className="py-2 text-deadlock-muted">Match settings (see below)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Match Config */}
            <div>
              <h3 className="text-sm font-semibold text-deadlock-muted uppercase tracking-wider mb-3">
                matchConfig Object
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-deadlock-border">
                      <th className="text-left py-2 pr-4 font-medium">Field</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deadlock-border">
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">gameMode</td>
                      <td className="py-2 pr-4">"standard" | "street_brawl"</td>
                      <td className="py-2 text-deadlock-muted">Game mode (default: "standard")</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">teamSize</td>
                      <td className="py-2 pr-4">number</td>
                      <td className="py-2 text-deadlock-muted">Players per team, 1-6 (default: 6)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">allowSpectators</td>
                      <td className="py-2 pr-4">boolean</td>
                      <td className="py-2 text-deadlock-muted">Allow spectators (default: true)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-amber">autoStart</td>
                      <td className="py-2 pr-4">boolean</td>
                      <td className="py-2 text-deadlock-muted">Auto-start draft when both teams are full and all players are ready (default: true)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Response */}
            <div>
              <h3 className="text-sm font-semibold text-deadlock-muted uppercase tracking-wider mb-3">
                Response (201 Created)
              </h3>
              <pre className="bg-deadlock-bg rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`{
  "url": "${baseUrl}/lobby/ABC123",
  "code": "ABC123",
  "lobby": {
    "id": "...",
    "code": "ABC123",
    "name": "API Lobby",
    "hostUserId": null,
    "host": null,
    "status": "waiting",
    "matchConfig": {
      "gameMode": "standard",
      "teamSize": 6,
      "autoStart": true,
      ...
    },
    "maxPlayers": 12,
    "allowTeamChange": true,
    "participants": [],
    ...
  }
}`}
              </pre>
            </div>

            {/* Example */}
            <div>
              <h3 className="text-sm font-semibold text-deadlock-muted uppercase tracking-wider mb-3">
                Example
              </h3>
              <pre className="bg-deadlock-bg rounded-lg p-4 overflow-x-auto text-sm font-mono">
{`curl -X POST ${baseUrl}/api/external/lobbies \\
  -H "Content-Type: application/json" \\
  -d '{
    "api_identifier": "my-app",
    "name": "My Custom Match",
    "maxPlayers": 12,
    "matchConfig": {
      "gameMode": "standard",
      "autoStart": true
    }
  }'`}
              </pre>
            </div>

            {/* Errors */}
            <div>
              <h3 className="text-sm font-semibold text-deadlock-muted uppercase tracking-wider mb-3">
                Errors
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-deadlock-border">
                      <th className="text-left py-2 pr-4 font-medium">Status</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deadlock-border">
                    <tr>
                      <td className="py-2 pr-4 font-mono">400</td>
                      <td className="py-2 text-deadlock-muted">Invalid request body (validation error)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono">429</td>
                      <td className="py-2 text-deadlock-muted">Rate limit exceeded (10 requests/minute)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-6 space-y-3">
            <h3 className="font-semibold">Notes</h3>
            <ul className="list-disc list-inside space-y-2 text-sm text-deadlock-muted">
              <li>
                API-created lobbies have no host, so they cannot be edited, and there is no Admin.
              </li>
              <li>
                By default, <code className="text-amber">allowTeamChange</code> is <code className="text-amber">true</code>,
                so players can freely move between teams.
              </li>
              <li>
                Lobbies expire after 2 hours of inactivity.
              </li>
              <li>
                Players can join using the lobby URL or the 6-character lobby code.
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
