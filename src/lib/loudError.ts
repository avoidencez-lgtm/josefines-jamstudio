/** Invariant 7: a loud error names what happened and the next step. */

const HAS_NEXT_STEP =
  /settings|first run|retry|free space|save the partial|not configured|delete index|check (the |your |provider|key|~\/|disk)|reconnect|rescan|pick (another|the |a |input|output|one |a scene|a listed)|analyze |import |open |then |restore |fix |choose |add a |press |use (one interface|a cc)|finish the |move (the |it |that )|copy (it|the)|left intact|browser preview|no audio is produced|requires the desktop|reopen |select a section|loopback|measure again|type an offset/i;

export function withNextStep(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || HAS_NEXT_STEP.test(t)) return text.trim();
  if (/exit blocked/i.test(t)) {
    return `${t}. Retry after the OS allows the window to close.`;
  }
  if (/does not exist on/i.test(t)) {
    return `${t}. Pick a scene this profile can play.`;
  }
  if (/above 127/i.test(t)) {
    return `${t}. Use a CC from 0 to 127.`;
  }
  if (/unknown rig profile/i.test(t)) {
    return `${t}. Pick a listed rig profile.`;
  }
  if (/unknown (chart|style)|is not a user chart/i.test(t)) {
    return `${t}. Pick a listed chart or style, or a chart you saved.`;
  }
  if (/midi|port disappeared|no midi/i.test(t)) {
    return `${t}. Open Rig, then Rescan or pick another port.`;
  }
  if (/microphone|voice/i.test(t)) {
    return `${t}. Open Jo. Open the voice setup and choose a microphone, or add an ElevenLabs key in Settings.`;
  }
  if (/audio|device|engine status|input:|output:|headless|\bhz\b/i.test(t)) {
    return `${t}. Open Settings → Audio devices and pick the same interface for input and output.`;
  }
  if (/chart|library|style|bundled/i.test(t)) {
    return `${t}. Open Library; fix the file or restore the bundled copy.`;
  }
  if (/no active recording/i.test(t)) {
    return `${t}. Start a take first.`;
  }
  if (/already recording/i.test(t)) {
    return `${t}. Stop the current take first.`;
  }
  if (/take|record|disk|export|wav|writer/i.test(t)) {
    return `${t}. Free disk space or restore the take folder, then retry.`;
  }
  if (/usage log|cost log/i.test(t)) {
    return `${t}. Check ~/JosefinesJamstudio and retry.`;
  }
  if (/key|provider|lyria|gemini/i.test(t)) {
    return `${t}. Open Settings → AI & models.`;
  }
  if (/cannot read|json|\.json/i.test(t)) {
    return `${t}. Fix the file or move it aside.`;
  }
  return `${t}. Open Settings → First run for the next step.`;
}
