-- Run from the repository root: lua tests/reaper-import.lua
-- Exercises the shipped script against the documented REAPER API boundary; no hardware required.
local file = assert(io.open("crates/jam-audio/src/reaper_import.lua", "r"))
local template = file:read("*a")
file:close()
local data = [[local session = {
  tempo=100, numerator=3, denominator=4, length=2,
  files={{file="guitar.wav",name="guitar",length=2,muted=false},
         {file="master.wav",name="master",length=2,muted=true}},
  markers={{name="Verse",time=0},{name="Chorus",time=1.8}},
  notes={{time=0.5,status=144,pitch=45,velocity=100},
         {time=0.5,status=145,pitch=60,velocity=80},
         {time=0.5,status=153,pitch=36,velocity=90}}
}
]]

local function run(options)
  local tracks, markers, destroyed, messages = {}, {}, {}, {}
  local began, ended, tempo = false, false, nil
  local tempos = {}
  local r = {}
  r.CountTracks = function() return options.occupied and 1 or #tracks end
  r.CountProjectMarkers = function() return 0 end
  r.CountTempoTimeSigMarkers = function() return 0 end
  r.GetPlayState = function() return 0 end
  r.get_action_context = function() return false, "C:\\Exports\\song\\Import into REAPER.lua" end
  r.ShowMessageBox = function(message) table.insert(messages, message) end
  r.PCM_Source_CreateFromFile = function(path)
    assert(path:find("C:\\Exports\\song\\", 1, true) == 1)
    if options.missing and path:find("master.wav", 1, true) then return nil end
    return path
  end
  r.PCM_Source_Destroy = function(source) table.insert(destroyed, source) end
  r.InsertTrackAtIndex = function(index, defaults)
    assert(index == #tracks and defaults == false)
    table.insert(tracks, {})
  end
  r.GetTrack = function(_, index) return tracks[index + 1] end
  r.GetSetMediaTrackInfo_String = function(track, key, value) track[key] = value end
  r.SetMediaTrackInfo_Value = function(track, key, value) track[key] = value end
  r.AddMediaItemToTrack = function(track) track.item = {}; return track.item end
  r.AddTakeToMediaItem = function(item) item.take = {}; return item.take end
  r.SetMediaItemTake_Source = function(take, source)
    if options.attach_failure then return false end
    take.source = source
    return true
  end
  r.SetMediaItemPosition = function(item, value) item.position = value end
  r.SetMediaItemLength = function(item, value) item.length = value end
  r.SetMediaItemInfo_Value = function(item, key, value) item[key] = value end
  r.SetMediaItemTakeInfo_Value = function(take, key, value) take[key] = value end
  r.SetTempoTimeSigMarker = function(_, index, time, measure, beat, bpm, num, den, linear)
    assert(index == -1 and measure == -1 and beat == -1 and not linear)
    table.insert(tempos, {time, bpm, num, den})
    if #tempos == 1 then tempo = {bpm, num, den}; assert(time == 0) end
    return true
  end
  r.AddProjectMarker = function(_, region, time, _, name)
    assert(not region)
    table.insert(markers, {name, time})
  end
  r.CreateNewMIDIItemInProj = function(track, start, finish, beats)
    assert(start == 0 and finish == 2 and not beats)
    track.item = {take={events={}}}
    return track.item
  end
  r.GetActiveTake = function(item) return item.take end
  r.MIDI_GetPPQPosFromProjTime = function(_, time) return time * 960 end
  r.MIDI_DisableSort = function(take) take.sorted = false end
  r.MIDI_InsertEvt = function(take, _, _, ppq, bytes)
    table.insert(take.events, {ppq, bytes})
    return true
  end
  r.MIDI_Sort = function(take) take.sorted = true end
  r.Undo_BeginBlock = function() began = true end
  r.Undo_EndBlock = function() ended = true end
  r.TrackList_AdjustWindows = function() end
  r.UpdateArrange = function() end
  setmetatable(r, {__index=function(_, key) error("Unexpected REAPER API: " .. key) end})
  local environment = setmetatable({reaper=r}, {__index=_G})
  local timing = options.variable and "session.tempos={{time=0,bpm=100},{time=0.75,bpm=125},{time=1.25,bpm=150}}\n" or ""
  assert(load(data .. timing .. template, "Jamstudio import", "t", environment))()
  if options.occupied then
    assert(#tracks == 0 and not began and #destroyed == 0)
    assert(messages[1]:find("empty project", 1, true))
  elseif options.missing then
    assert(#tracks == 0 and not began and #destroyed == 1)
    assert(messages[1]:find("Cannot open", 1, true))
  elseif options.attach_failure then
    assert(began and ended and #destroyed == 2)
    assert(messages[1]:find("Use Undo", 1, true))
  else
    assert(began and ended and #tracks == 5 and #destroyed == 0)
    assert(tempo[1] == 100 and tempo[2] == 3 and tempo[3] == 4)
    if options.variable then
      assert(#tempos == 3 and tempos[2][1] == 0.75 and tempos[2][2] == 125)
      assert(tempos[3][1] == 1.25 and tempos[3][2] == 150)
      assert(tempos[2][3] == 0 and tempos[2][4] == 0, "tempo changes retain meter")
    else assert(#tempos == 1) end
    assert(markers[2][2] == 1.8)
    assert(tracks[1].B_MUTE == 0 and tracks[2].B_MUTE == 1)
    local item = tracks[1].item
    assert(item.position == 0 and item.length == 2 and item.C_BEATATTACHMODE == 0)
    assert(item.take.D_PLAYRATE == 1 and item.B_LOOPSRC == 0)
    for i=3,5 do
      assert(tracks[i].B_MUTE == 1 and tracks[i].I_RECARM == 0)
      local take = tracks[i].item.take
      assert(take.sorted and take.events[1][1] == 480)
      assert(take.events[2][1] == 1920 and take.events[2][2]:byte(2) == 123)
    end
    assert(tracks[3].P_NAME == "Bass MIDI" and tracks[5].P_NAME == "Drums MIDI")
    assert(messages[1]:find("Ready", 1, true))
  end
end
run({})
run({variable=true})
run({occupied=true})
run({missing=true})
run({attach_failure=true})
print("REAPER import: timing, MIDI, reference muting, existing-project guard and failure cleanup passed")
