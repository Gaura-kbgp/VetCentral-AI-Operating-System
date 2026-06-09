'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Clock, User, CheckCircle2 } from 'lucide-react';
import type { PersonAvailability, BusySlot } from '@/lib/actions/scheduling';

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]; // 8am–6pm

function hourLabel(h: number) {
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

interface Props {
  people:       PersonAvailability[];
  proposedStart?: Date | null;
  proposedEnd?:   Date | null;
  onSelectHour:  (hour: number) => void;   // called when user clicks a free column
}

export function AvailabilityGrid({ people, proposedStart, proposedEnd, onSelectHour }: Props) {
  if (people.length === 0) return null;

  const proposedHour = proposedStart ? proposedStart.getHours() : null;

  // For each hour, check if ALL people are free
  const hourStatus = useMemo(() => {
    return HOURS.map(h => {
      const slotStart = proposedStart ? new Date(proposedStart) : new Date();
      slotStart.setHours(h, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setHours(h + 1, 0, 0, 0);

      let busyCount = 0;
      for (const person of people) {
        const isBusy = person.busy_slots.some(slot => {
          const sS = new Date(slot.start);
          const sE = new Date(slot.end);
          return sS < slotEnd && sE > slotStart;
        });
        if (isBusy) busyCount++;
      }

      return {
        hour: h,
        busyCount,
        allFree: busyCount === 0,
        isProposed: proposedHour === h,
      };
    });
  }, [people, proposedStart, proposedHour]);

  const freeSlots = hourStatus.filter(s => s.allFree).length;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-500" />
          <span className="text-[12px] font-bold text-gray-700">Attendee Availability</span>
          {proposedStart && (
            <span className="text-[11px] text-gray-500">
              — {format(proposedStart, 'EEE, MMM d')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />
            Free
          </span>
          <span className="flex items-center gap-1 text-[11px] text-red-500 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 inline-block" />
            Busy
          </span>
          <span className="flex items-center gap-1 text-[11px] text-blue-600 font-medium">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-400 inline-block" />
            Proposed
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[11px]">
          {/* Hour header row */}
          <thead>
            <tr>
              <th className="w-32 px-3 py-1.5 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-r border-gray-100">
                Person
              </th>
              {HOURS.map(h => (
                <th
                  key={h}
                  className="px-0 py-1.5 text-center border-b border-r border-gray-100 last:border-r-0 font-semibold text-gray-500"
                >
                  {hourLabel(h)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Per-person rows */}
            {people.map((person, pi) => (
              <tr key={person.email} className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                {/* Name column */}
                <td className="px-3 py-2 border-r border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-[9px] font-bold">
                        {person.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate max-w-[88px]">{person.name}</p>
                      {person.job_title && (
                        <p className="text-gray-400 truncate max-w-[88px]">{person.job_title}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Hour cells */}
                {HOURS.map(h => {
                  const slotStart = proposedStart ? new Date(proposedStart) : new Date();
                  slotStart.setHours(h, 0, 0, 0);
                  const slotEnd = new Date(slotStart);
                  slotEnd.setHours(h + 1, 0, 0, 0);

                  const busySlot: BusySlot | undefined = person.busy_slots.find(slot => {
                    const sS = new Date(slot.start);
                    const sE = new Date(slot.end);
                    return sS < slotEnd && sE > slotStart;
                  });

                  const isBusy     = !!busySlot;
                  const isProposed = proposedHour === h;

                  return (
                    <td
                      key={h}
                      className="border-r border-gray-100 last:border-r-0 p-0.5"
                      title={isBusy ? `Busy: ${busySlot?.title}` : 'Available'}
                    >
                      <div className={`
                        h-7 w-full rounded flex items-center justify-center transition-colors
                        ${isBusy
                          ? 'bg-red-100 border border-red-200'
                          : isProposed
                          ? 'bg-blue-100 border border-blue-300'
                          : 'bg-emerald-50 border border-emerald-100'
                        }
                      `}>
                        {isBusy && (
                          <span className="text-red-500 font-bold text-[9px] truncate px-0.5 leading-none">
                            {busySlot?.title?.slice(0, 6) ?? '···'}
                          </span>
                        )}
                        {!isBusy && isProposed && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* "All Free" summary row */}
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="px-3 py-1.5 border-r border-gray-100">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">All Free</span>
              </td>
              {hourStatus.map(({ hour, allFree, isProposed }) => (
                <td key={hour} className="border-r border-gray-100 last:border-r-0 p-0.5">
                  <button
                    type="button"
                    disabled={!allFree}
                    onClick={() => allFree && onSelectHour(hour)}
                    title={allFree ? `Everyone free at ${hourLabel(hour)} — click to select` : 'Someone is busy'}
                    className={`
                      h-7 w-full rounded flex items-center justify-center transition-all
                      ${allFree && isProposed
                        ? 'bg-blue-500 border border-blue-600 cursor-pointer hover:bg-blue-600'
                        : allFree
                        ? 'bg-emerald-500 border border-emerald-600 cursor-pointer hover:bg-emerald-600'
                        : 'bg-gray-100 border border-gray-200 cursor-not-allowed'
                      }
                    `}
                  >
                    {allFree
                      ? <CheckCircle2 className={`h-3.5 w-3.5 ${isProposed ? 'text-white' : 'text-white'}`} />
                      : <span className="text-gray-400 text-[10px]">✗</span>
                    }
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          {freeSlots > 0
            ? `${freeSlots} slot${freeSlots !== 1 ? 's' : ''} where everyone is free — click green ✓ to pick that time`
            : 'No fully free slots today — try a different date'
          }
        </p>
        {proposedStart && (
          <span className="text-[11px] font-semibold text-blue-600">
            Proposed: {format(proposedStart, 'h:mm aa')}
            {proposedEnd && ` – ${format(proposedEnd, 'h:mm aa')}`}
          </span>
        )}
      </div>
    </div>
  );
}
