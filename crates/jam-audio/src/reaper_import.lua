-- Generated session data above; API: https://www.reaper.fm/sdk/reascript/reascripthelp.html
-- Run in an empty project. No extensions, network, shell commands or automatic saves.
if reaper.CountTracks(0) > 0 or reaper.CountProjectMarkers(0) > 0
    or reaper.CountTempoTimeSigMarkers(0) > 0 or reaper.GetPlayState() ~= 0 then
  reaper.ShowMessageBox("Open a new empty project tab, stop playback, then run this import again.", "Jamstudio", 0)
  return
end
local _, script = reaper.get_action_context()
local folder = script:match("^(.*[/\\])")
if not folder then
  reaper.ShowMessageBox("Load this script from the exported folder using the Actions list.", "Jamstudio", 0)
  return
end
-- Decode all audio before touching the project, so missing media cannot make a partial import.
local sources = {}
for i, file in ipairs(session.files) do
  sources[i] = reaper.PCM_Source_CreateFromFile(folder .. file.file)
  if not sources[i] then
    for _, source in ipairs(sources) do reaper.PCM_Source_Destroy(source) end
    reaper.ShowMessageBox("Cannot open " .. file.file .. ". Keep all exported files together and export again if needed.", "Jamstudio", 0)
    return
  end
end

local function new_track(name, muted)
  local index = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(index, false)
  local track = reaper.GetTrack(0, index)
  reaper.GetSetMediaTrackInfo_String(track, "P_NAME", name, true)
  reaper.SetMediaTrackInfo_Value(track, "B_MUTE", muted and 1 or 0)
  reaper.SetMediaTrackInfo_Value(track, "D_VOL", 1)
  reaper.SetMediaTrackInfo_Value(track, "I_RECARM", 0)
  return track
end

reaper.Undo_BeginBlock()
local ok, error_text = pcall(function()
  for i, point in ipairs(session.tempos or {{time=0, bpm=session.tempo}}) do
    assert(reaper.SetTempoTimeSigMarker(0, -1, point.time, -1, -1, point.bpm, i == 1 and session.numerator or 0, i == 1 and session.denominator or 0, false), "Cannot set project tempo")
  end
  for i, file in ipairs(session.files) do
    local track = new_track(file.name, file.muted)
    local item = reaper.AddMediaItemToTrack(track)
    local take = reaper.AddTakeToMediaItem(item)
    assert(reaper.SetMediaItemTake_Source(take, sources[i]), "Cannot attach " .. file.file)
    sources[i] = false -- owned by the media item from here
    reaper.SetMediaItemPosition(item, 0, false)
    reaper.SetMediaItemLength(item, file.length, false)
    reaper.SetMediaItemInfo_Value(item, "C_BEATATTACHMODE", 0) -- seconds; changing tempo never stretches guitar
    reaper.SetMediaItemInfo_Value(item, "B_LOOPSRC", 0)
    reaper.SetMediaItemInfo_Value(item, "D_FADEINLEN", 0)
    reaper.SetMediaItemInfo_Value(item, "D_FADEOUTLEN", 0)
    reaper.SetMediaItemTakeInfo_Value(take, "D_PLAYRATE", 1)
  end
  for _, marker in ipairs(session.markers) do
    reaper.AddProjectMarker(0, false, marker.time, 0, marker.name, -1)
  end
  local midi_takes = {}
  local names = {[0]="Bass MIDI", [1]="Comp MIDI", [9]="Drums MIDI"}
  for _, note in ipairs(session.notes) do
    local channel = note.status % 16
    if not midi_takes[channel] then
      local track = new_track(names[channel] or ("MIDI channel " .. (channel + 1)), true)
      local item = reaper.CreateNewMIDIItemInProj(track, 0, session.length, false)
      midi_takes[channel] = reaper.GetActiveTake(item)
      reaper.MIDI_DisableSort(midi_takes[channel])
    end
    local take = midi_takes[channel]
    local ppq = reaper.MIDI_GetPPQPosFromProjTime(take, note.time)
    assert(reaper.MIDI_InsertEvt(take, false, false, ppq, string.char(note.status, note.pitch, note.velocity)), "Cannot import MIDI event")
  end
  for channel, take in pairs(midi_takes) do
    local last = reaper.MIDI_GetPPQPosFromProjTime(take, session.length)
    reaper.MIDI_InsertEvt(take, false, false, last, string.char(176 + channel, 123, 0))
    reaper.MIDI_Sort(take)
  end
end)
for _, source in pairs(sources) do if source then reaper.PCM_Source_Destroy(source) end end
reaper.Undo_EndBlock("Import Jamstudio song", -1)
reaper.TrackList_AdjustWindows(false)
reaper.UpdateArrange()
if not ok then
  reaper.ShowMessageBox("Import stopped: " .. tostring(error_text) .. "\nUse Undo to remove the partial import. Original files are unchanged.", "Jamstudio", 0)
else
  reaper.ShowMessageBox("Ready. Save this project in the export folder.\n\nMIDI tracks are muted: add instruments, then mute their matching audio stems before enabling them. Audio items retain their recorded speed when you change tempo.", "Jamstudio", 0)
end
