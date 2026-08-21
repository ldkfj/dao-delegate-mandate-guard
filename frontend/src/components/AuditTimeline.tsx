import React, { useState, useEffect } from 'react';
import { getAuditTimeline } from '../contract/service';
import type { AuditEntryView, AuditEventKind } from '../contract/types';

interface AuditTimelineProps {
  refreshTrigger?: number;
  onSelectMandate?: (mandateId: string) => void;
  onSelectCapability?: (capabilityId: string) => void;
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({
  refreshTrigger = 0,
  onSelectMandate,
  onSelectCapability,
}) => {
  const [entries, setEntries] = useState<AuditEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterKind, setFilterKind] = useState<string>('ALL');
  const [filterSearch, setFilterSearch] = useState<string>('');

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAuditTimeline();
      setEntries(data);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to load audit timeline';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [refreshTrigger]);

  const filteredEntries = entries.filter((entry) => {
    if (filterKind !== 'ALL' && entry.event_kind !== filterKind) {
      return false;
    }
    if (filterSearch.trim()) {
      const s = filterSearch.toLowerCase().trim();
      const matchActor = entry.actor.toLowerCase().includes(s);
      const matchMandate = entry.mandate_id.toLowerCase().includes(s);
      const matchCap = entry.capability_id.toLowerCase().includes(s);
      const matchHash = entry.content_hash.toLowerCase().includes(s);
      return matchActor || matchMandate || matchCap || matchHash;
    }
    return true;
  });

  const formatHash = (h: string) => {
    if (!h) return '';
    return `${h.slice(0, 10)}...${h.slice(-8)}`;
  };

  const formatAddress = (a: string) => {
    if (!a) return '';
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  };

  const getEventBadgeClass = (kind: AuditEventKind) => {
    switch (kind) {
      case 'MANDATE_CREATED':
        return 'event-badge-mandate-created';
      case 'PROPOSAL_SUBMITTED':
        return 'event-badge-proposal-submitted';
      case 'CAPABILITY_EVALUATED':
        return 'event-badge-capability-evaluated';
      case 'INTENT_RECORDED':
        return 'event-badge-intent-recorded';
      case 'CAPABILITY_USED':
        return 'event-badge-capability-used';
      case 'MANDATE_REVOKED':
        return 'event-badge-mandate-revoked';
      default:
        return 'event-badge-default';
    }
  };

  return (
    <section className="card-panel audit-timeline-panel" aria-labelledby="audit-timeline-title">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <span className="panel-icon" aria-hidden="true">
            📜
          </span>
          <div>
            <h2 id="audit-timeline-title" className="panel-title">
              Governance Audit Timeline
            </h2>
            <p className="panel-subtitle">
              Append-only cryptographically linked audit log for complete delegate governance accountability.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn-refresh"
          onClick={fetchTimeline}
          disabled={loading}
          aria-label="Refresh audit timeline"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Log'}
        </button>
      </div>

      {/* Filter Controls */}
      <div className="timeline-filter-bar">
        <div className="filter-group">
          <label htmlFor="filter-event-kind" className="filter-label">
            Filter Event:
          </label>
          <select
            id="filter-event-kind"
            className="form-select"
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
          >
            <option value="ALL">All Events ({entries.length})</option>
            <option value="MANDATE_CREATED">MANDATE_CREATED</option>
            <option value="PROPOSAL_SUBMITTED">PROPOSAL_SUBMITTED</option>
            <option value="CAPABILITY_EVALUATED">CAPABILITY_EVALUATED</option>
            <option value="INTENT_RECORDED">INTENT_RECORDED</option>
            <option value="CAPABILITY_USED">CAPABILITY_USED</option>
            <option value="MANDATE_REVOKED">MANDATE_REVOKED</option>
          </select>
        </div>

        <div className="filter-group filter-search-group">
          <label htmlFor="filter-search-input" className="filter-label">
            Search:
          </label>
          <input
            id="filter-search-input"
            type="text"
            className="form-input filter-input"
            placeholder="Search by Actor, Mandate #, Cap #, Hash..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="form-alert-error" role="alert">
          <span className="alert-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Timeline Table / List */}
      <div className="timeline-table-container">
        {loading && entries.length === 0 ? (
          <div className="panel-loading-state" aria-busy="true">
            <span className="loading-spinner" aria-hidden="true" />
            <p>Loading audit timeline from GenLayer contract...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="timeline-empty-state">
            <p>No audit entries match the current filter criteria.</p>
          </div>
        ) : (
          <table className="timeline-table" aria-label="Governance Audit Entries">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Event Kind</th>
                <th scope="col">Actor</th>
                <th scope="col">Mandate ID</th>
                <th scope="col">Capability ID</th>
                <th scope="col">State Transition</th>
                <th scope="col">Content Hash</th>
                <th scope="col">Timestamp (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.index} className="timeline-row">
                  <td className="cell-index font-mono">#{entry.index}</td>
                  <td className="cell-kind">
                    <span
                      className={`event-badge ${getEventBadgeClass(entry.event_kind)}`}
                    >
                      {entry.event_kind}
                    </span>
                  </td>
                  <td className="cell-actor font-mono" title={entry.actor}>
                    {formatAddress(entry.actor)}
                  </td>
                  <td className="cell-mandate font-mono">
                    {entry.mandate_id ? (
                      <button
                        type="button"
                        className="btn-link-action"
                        onClick={() =>
                          onSelectMandate && onSelectMandate(entry.mandate_id)
                        }
                      >
                        Mandate #{entry.mandate_id}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="cell-capability font-mono">
                    {entry.capability_id ? (
                      <button
                        type="button"
                        className="btn-link-action"
                        onClick={() =>
                          onSelectCapability &&
                          onSelectCapability(entry.capability_id)
                        }
                      >
                        Cap #{entry.capability_id}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="cell-state font-mono">
                    <span className="state-transition">
                      <span className="prior-state">{entry.prior_state || 'NONE'}</span>
                      <span className="state-arrow">→</span>
                      <span className="new-state">{entry.new_state}</span>
                    </span>
                  </td>
                  <td
                    className="cell-hash font-mono"
                    title={entry.content_hash}
                  >
                    {formatHash(entry.content_hash)}
                  </td>
                  <td className="cell-time font-mono">
                    {entry.timestamp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};
