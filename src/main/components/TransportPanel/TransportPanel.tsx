import { CircularProgress, makeStyles, Toolbar } from "@material-ui/core"
import {
  FastForward,
  FastRewind,
  FiberManualRecord,
  Pause,
  PlayArrow,
  Stop,
} from "@material-ui/icons"
import { observer } from "mobx-react-lite"
import { FC } from "react"
import styled from "styled-components"
import { fastForwardOneBar, play, rewindOneBar, stop } from "../../actions"
import { toggleRecording } from "../../actions/recording"
import { useStores } from "../../hooks/useStores"

const useStyles = makeStyles((theme) => ({
  toolbar: {
    justifyContent: "center",
    background: "var(--background-color)",
    borderTop: "1px solid var(--divider-color)",
  },
  loop: {
    marginLeft: "1rem",
    height: "2rem",
  },
}))

const TempoInput = styled.input`
  background: transparent;
  -webkit-appearance: none;
  border: none;
  color: inherit;
  font-size: inherit;
  font-family: inherit;
  width: 5em;
  text-align: center;
  outline: none;
  font-family: "Roboto Mono", monospace;
  font-size: 1rem;
  padding: 0.3rem 0;

  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
`

const Button = styled.div`
  --webkit-appearance: none;
  outline: none;
  border: none;
  border-radius: 100%;
  margin: 0.25rem;
  padding: 0.4rem;
  color: var(--text-color);
  display: flex;
  cursor: pointer;

  &:hover {
    background: #ffffff0d;
  }

  svg {
    font-size: 1.2rem;
  }
`

const PlayButton = styled(Button)`
  background: var(--theme-color);

  &:hover {
    background: var(--theme-color);
    opacity: 0.8;
  }

  &.active {
    background: var(--theme-color);
  }
`

const RecordButton = styled(Button)`
  &.active {
    color: ${({ theme }) => theme.recordColor};
  }
`

const TempoWrapper = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  padding-left: 0.7rem;
  border-radius: 0.25rem;

  label {
    font-size: 0.6rem;
    color: var(--secondary-text-color);
  }

  &:focus-within {
    border: 1px solid var(--divider-color);
    background: #ffffff14;
  }
`

const TempoForm: FC = observer(() => {
  const rootStore = useStores()
  const tempo = rootStore.pianoRollStore.currentTempo

  const changeTempo = (tempo: number) => {
    const fixedTempo = Math.max(1, Math.min(512, tempo))
    rootStore.song.conductorTrack?.setTempo(
      fixedTempo,
      rootStore.services.player.position
    )
    rootStore.services.player.currentTempo = fixedTempo
  }

  const onKeyPressTempo = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      e.currentTarget.blur()
    }
  }

  const onChangeTempo = (e: React.ChangeEvent<HTMLInputElement>) =>
    changeTempo(parseFloat(e.target.value))

  return (
    <TempoWrapper>
      <label htmlFor="tempo-input">BPM</label>
      <TempoInput
        type="number"
        id="tempo-input"
        min={1}
        max={1000}
        value={Math.round(tempo * 100) / 100}
        step={1}
        onChange={onChangeTempo}
        onKeyPress={onKeyPressTempo}
      />
    </TempoWrapper>
  )
})

const TimestampText = styled.div`
  font-family: "Roboto Mono", monospace;
  font-size: 0.9rem;
  color: var(--secondary-text-color);
`

const Timestamp: FC = observer(() => {
  const { pianoRollStore } = useStores()
  const mbtTime = pianoRollStore.currentMBTTime
  return <TimestampText>{mbtTime}</TimestampText>
})

export const ToolbarSeparator = styled.div`
  background: var(--divider-color);
  margin: 0.4em 1em;
  width: 1px;
  height: 1rem;
`

export const Right = styled.div`
  position: absolute;
  right: 1em;
`

export const TransportPanel: FC = observer(() => {
  const rootStore = useStores()

  const isPlaying = rootStore.services.player.isPlaying
  const isRecording = rootStore.services.midiRecorder.isRecording
  const canRecording =
    Object.values(rootStore.midiDeviceStore.enabledInputs).filter((e) => e)
      .length > 0
  const isSynthLoading = rootStore.services.synth.isLoading

  const onClickPlay = play(rootStore)
  const onClickStop = stop(rootStore)
  const onClickBackward = rewindOneBar(rootStore)
  const onClickForward = fastForwardOneBar(rootStore)
  const onClickRecord = toggleRecording(rootStore)

  const classes = useStyles({})
  return (
    <Toolbar variant="dense" className={classes.toolbar}>
      <Button onClick={onClickBackward}>
        <FastRewind />
      </Button>
      <Button onClick={onClickStop}>
        <Stop />
      </Button>

      <PlayButton
        id="button-play"
        onClick={onClickPlay}
        className={isPlaying ? "active" : undefined}
      >
        {isPlaying ? <Pause /> : <PlayArrow />}
      </PlayButton>

      {canRecording && (
        <RecordButton
          onClick={onClickRecord}
          className={isRecording ? "active" : undefined}
        >
          <FiberManualRecord />
        </RecordButton>
      )}

      <Button onClick={onClickForward}>
        <FastForward />
      </Button>

      <ToolbarSeparator />

      <TempoForm />

      <ToolbarSeparator />

      <Timestamp />

      {isSynthLoading && (
        <Right>
          <CircularProgress size="1rem" />
        </Right>
      )}
    </Toolbar>
  )
})
