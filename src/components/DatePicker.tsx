// Attach / edit a !(date) token on a bullet.
import { useState } from 'react';
import Modal from './Modal';
import { useStore } from '../store/store';
import { parseDateToken, toToken } from '../lib/dates';

interface Props {
  itemId: string;
  token: string | null;
  onClose: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function DatePicker({ itemId, token, onClose }: Props) {
  const existing = token ? parseDateToken(token.replace(/^!\(|\)$/g, '')) : null;
  const base = existing?.date ?? new Date();
  const [dateStr, setDateStr] = useState(
    `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`,
  );
  const [useTime, setUseTime] = useState(existing?.hasTime ?? false);
  const [timeStr, setTimeStr] = useState(
    existing?.hasTime ? `${pad(base.getHours())}:${pad(base.getMinutes())}` : '09:00',
  );
  const [repeat, setRepeat] = useState(existing?.repeat ?? '');

  const apply = () => {
    const [y, m, d] = dateStr.split('-').map(Number);
    let hh = 0;
    let mm = 0;
    if (useTime) {
      const [h, mi] = timeStr.split(':').map(Number);
      hh = h || 0;
      mm = mi || 0;
    }
    const date = new Date(y, (m || 1) - 1, d || 1, hh, mm);
    const newTok = toToken(date, useTime, repeat || null);
    const s = useStore.getState();
    const text = s.items[itemId]?.text ?? '';
    let next: string;
    if (token && text.includes(token)) next = text.replace(token, newTok);
    else next = (text.trimEnd() + ' ' + newTok).trim();
    s.setText(itemId, next);
    onClose();
  };

  const remove = () => {
    if (token) {
      const s = useStore.getState();
      const text = s.items[itemId]?.text ?? '';
      s.setText(itemId, text.replace(token, '').replace(/ {2,}/g, ' ').trim());
    }
    onClose();
  };

  return (
    <Modal onClose={onClose} className="date-modal">
      <div className="modal-head">
        <h2>📅 Date</h2>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="date-body">
        <label className="field">
          <span>Date</span>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
        </label>
        <label className="field row">
          <input type="checkbox" checked={useTime} onChange={(e) => setUseTime(e.target.checked)} />
          <span>Time</span>
          <input
            type="time"
            value={timeStr}
            disabled={!useTime}
            onChange={(e) => setTimeStr(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Repeat</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
            <option value="">Does not repeat</option>
            <option value="1d">Every day</option>
            <option value="1w">Every week</option>
            <option value="2w">Every 2 weeks</option>
            <option value="1m">Every month</option>
            <option value="1y">Every year</option>
          </select>
        </label>
      </div>
      <div className="modal-foot">
        {token && (
          <button className="btn danger" onClick={remove}>
            Remove
          </button>
        )}
        <div className="grow" />
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={apply}>
          {token ? 'Update' : 'Set date'}
        </button>
      </div>
    </Modal>
  );
}
