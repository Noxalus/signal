import flatten from "lodash/flatten"
import range from "lodash/range"
import throttle from "lodash/throttle"
import { AnyChannelEvent, AnyEvent, MIDIControlEvents } from "midifile-ts"
import { computed, makeObservable, observable } from "mobx"
import { SendableEvent, SynthOutput } from "../../main/services/SynthOutput"
import { SongStore } from "../../main/stores/SongStore"
import { deassemble as deassembleNote } from "../helpers/noteAssembler"
import {
  controllerMidiEvent,
  noteOffMidiEvent,
  noteOnMidiEvent,
} from "../midi/MidiEvent"
import Song from "../song"
import { NoteEvent, TrackEvent } from "../track"
import { getStatusEvents } from "../track/selector"
import TrackMute from "../trackMute"
import { DistributiveOmit } from "../types"
import EventScheduler from "./EventScheduler"
import { PlayerEvent, PlayerEventOf } from "./PlayerEvent"

function convertTrackEvents(
  events: TrackEvent[],
  channel: number | undefined,
  trackId: number
) {
  return flatten(events.map((e) => deassembleNote(e))).map(
    (e) =>
      ({ ...e, channel: channel, trackId } as PlayerEventOf<AnyChannelEvent>)
  )
}

export function collectAllEvents(song: Song): PlayerEvent[] {
  return flatten(
    song.tracks.map((t, i) => convertTrackEvents(t.events, t.channel, i))
  )
}

export interface LoopSetting {
  begin: number
  end: number
  enabled: boolean
}

const TIMER_INTERVAL = 50
const LOOK_AHEAD_TIME = 50

export default class Player {
  private _currentTempo = 120
  private _scheduler: EventScheduler<PlayerEvent> | null = null
  private _songStore: SongStore
  private _output: SynthOutput
  private _trackMute: TrackMute
  private _interval: number | null = null
  private _currentTick = 0
  private _isPlaying = false

  disableSeek: boolean = false

  loop: LoopSetting = {
    begin: 0,
    end: 0,
    enabled: false,
  }

  constructor(output: SynthOutput, trackMute: TrackMute, songStore: SongStore) {
    makeObservable<Player, "_currentTick" | "_isPlaying">(this, {
      _currentTick: observable,
      _isPlaying: observable,
      loop: observable,
      position: computed,
      isPlaying: computed,
    })

    this._output = output
    this._trackMute = trackMute
    this._songStore = songStore
  }

  private get song() {
    return this._songStore.song
  }

  private get timebase() {
    return this.song.timebase
  }

  play() {
    if (this.isPlaying) {
      console.warn("called play() while playing. aborted.")
      return
    }
    const eventsToPlay = collectAllEvents(this.song)
    this._scheduler = new EventScheduler(
      eventsToPlay,
      this._currentTick,
      this.timebase,
      TIMER_INTERVAL + LOOK_AHEAD_TIME
    )
    this._isPlaying = true
    this._output.activate()
    this._interval = window.setInterval(() => this._onTimer(), TIMER_INTERVAL)
    this._output.activate()
  }

  set position(tick: number) {
    if (!Number.isInteger(tick)) {
      console.warn("Player.tick should be an integer", tick)
    }
    if (this.disableSeek) {
      return
    }
    tick = Math.min(Math.max(Math.floor(tick), 0), this.song.endOfSong)
    if (this._scheduler) {
      this._scheduler.seek(tick)
    }
    this._currentTick = tick

    if (this.isPlaying) {
      this.allSoundsOff()
    }

    this.sendCurrentStateEvents()
  }

  get position() {
    return this._currentTick
  }

  get isPlaying() {
    return this._isPlaying
  }

  get numberOfChannels() {
    return 0xf
  }

  allSoundsOffChannel(ch: number) {
    this.sendEvent(
      controllerMidiEvent(0, ch, MIDIControlEvents.ALL_SOUNDS_OFF, 0)
    )
  }

  allSoundsOff() {
    for (const ch of range(0, this.numberOfChannels)) {
      this.allSoundsOffChannel(ch)
    }
  }

  allSoundsOffExclude(channel: number) {
    for (const ch of range(0, this.numberOfChannels)) {
      if (ch !== channel) {
        this.allSoundsOffChannel(ch)
      }
    }
  }

  private resetControllers() {
    for (const ch of range(0, this.numberOfChannels)) {
      this.sendEvent(
        controllerMidiEvent(0, ch, MIDIControlEvents.RESET_CONTROLLERS, 0x7f)
      )
    }
  }

  stop() {
    this._scheduler = null
    this.allSoundsOff()
    this._isPlaying = false

    if (this._interval !== null) {
      clearInterval(this._interval)
      this._interval = null
    }
  }

  reset() {
    this.resetControllers()
    this.stop()
    this._currentTick = 0
  }

  /*
   to restore synthesizer state (e.g. pitch bend)
   collect all previous state events
   and send them to the synthesizer
  */
  sendCurrentStateEvents() {
    this.song.tracks
      .flatMap((t, i) => {
        const statusEvents = getStatusEvents(t.events, this._currentTick)
        statusEvents.forEach((e) => this.applyPlayerEvent(e))
        return convertTrackEvents(statusEvents, t.channel, i)
      })
      .forEach((e) => this.sendEvent(e))
  }

  get currentTempo() {
    return this._currentTempo
  }

  set currentTempo(value: number) {
    this._currentTempo = value
  }

  playNote({
    channel,
    noteNumber,
    velocity,
    duration,
  }: Pick<NoteEvent, "noteNumber" | "velocity" | "duration"> & {
    channel: number
  }) {
    this._output.activate()
    this.sendEvent(noteOnMidiEvent(0, channel, noteNumber, velocity))
    this.sendEvent(
      noteOffMidiEvent(0, channel, noteNumber, 0),
      this.tickToMillisec(duration) / 1000
    )
  }

  tickToMillisec(tick: number) {
    return (tick / (this.timebase / 60) / this._currentTempo) * 1000
  }

  // delayTime: seconds, timestampNow: milliseconds
  sendEvent(
    event: SendableEvent,
    delayTime: number = 0,
    timestampNow: number = performance.now()
  ) {
    this._output.sendEvent(event, delayTime, timestampNow)
  }

  private syncPosition = throttle(() => {
    if (this._scheduler !== null) {
      this._currentTick = this._scheduler.currentTick
    }
  }, 50)

  private applyPlayerEvent(
    e: DistributiveOmit<AnyEvent, "deltaTime" | "channel">
  ) {
    if (e.type !== "channel" && "subtype" in e) {
      switch (e.subtype) {
        case "setTempo":
          this._currentTempo = 60000000 / e.microsecondsPerBeat
          break
        default:
          break
      }
    }
  }

  private _onTimer() {
    if (this._scheduler === null) {
      return
    }

    const timestamp = performance.now()
    const events = this._scheduler.readNextEvents(this._currentTempo, timestamp)

    events.forEach(({ event: e, timestamp: time }) => {
      if (e.type === "channel") {
        if (this._trackMute.shouldPlayTrack(e.trackId)) {
          // channel イベントを MIDI Output に送信
          // Send Channel Event to MIDI OUTPUT
          const delayTime = (time - timestamp) / 1000
          this.sendEvent(e, delayTime, timestamp)
        }
      } else {
        // channel イベント以外を実行
        // Run other than Channel Event
        this.applyPlayerEvent(e)
      }
    })

    if (this._scheduler.currentTick >= this.song.endOfSong) {
      this.stop()
    } else {
      const currentTick = this._scheduler.currentTick

      if (
        this.loop.enabled &&
        this.loop.begin !== null &&
        currentTick >= this.loop.end
      ) {
        this.position = this.loop.begin
      }
    }

    this.syncPosition()
  }
}
