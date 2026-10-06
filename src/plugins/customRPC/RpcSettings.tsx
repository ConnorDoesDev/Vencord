/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./settings.css";

import { isPluginEnabled } from "@api/PluginManager";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { resolveError } from "@components/settings/tabs/plugins/components/Common";
import { debounce } from "@shared/debounce";
import { classNameFactory } from "@utils/css";
import { RenderModalProps } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { Modal, openModal, Select, Text, TextInput, useState } from "@webpack/common";

import CustomRPCPlugin, { RpcConfig, rpcConfigKeys, RpcPreset, setRpc, settings, TimestampMode } from ".";

const cl = classNameFactory("vc-customRPC-settings-");

type SettingsKey = keyof typeof settings.store;

interface TextOption<T> {
    settingsKey: SettingsKey;
    label: string;
    disabled?: boolean;
    transform?: (value: string) => T;
    isValid?: (value: T) => true | string;
}

interface SelectOption<T> {
    settingsKey: SettingsKey;
    label: string;
    disabled?: boolean;
    options: { label: string; value: T; default?: boolean; }[];
}

const makeValidator = (maxLength: number, isRequired = false) => (value: string) => {
    if (isRequired && !value) return "This field is required.";
    if (value.length > maxLength) return `Must be not longer than ${maxLength} characters.`;
    return true;
};

const maxLength128 = makeValidator(128);

function isAppIdValid(value: string) {
    if (!/^\d{16,21}$/.test(value)) return "Must be a valid Discord ID.";
    return true;
}

const updateRPC = debounce(() => {
    setRpc(true);
    if (isPluginEnabled(CustomRPCPlugin.name)) setRpc();
});

function getConfig(): RpcConfig {
    return Object.fromEntries(rpcConfigKeys.map(key => [key, settings.store[key]]));
}

function applyConfig(config: RpcConfig) {
    Object.assign(settings.store, Object.fromEntries(rpcConfigKeys.map(key => [key, config[key]])));
}

function updatePresets(update: (presets: RpcPreset[]) => RpcPreset[]) {
    settings.store.presets = update(settings.store.presets ?? []);
}

function selectPreset(id: string) {
    if (!id) {
        settings.store.activePresetId = undefined;
        return;
    }

    const preset = settings.store.presets?.find(p => p.id === id);
    if (!preset) return;

    applyConfig(preset.config);
    settings.store.activePresetId = id;
    updateRPC();
}

function createPreset(name: string) {
    const id = crypto.randomUUID();
    updatePresets(presets => [...presets, { id, name, config: getConfig() }]);
    settings.store.activePresetId = id;
}

function renamePreset(id: string, name: string) {
    updatePresets(presets => presets.map(p => p.id === id ? { ...p, name } : p));
}

function deletePreset(id: string) {
    updatePresets(presets => presets.filter(p => p.id !== id));
    settings.store.activePresetId = undefined;
}

// Keeps the active preset in sync with every edit made to the fields
function saveActivePreset() {
    const { activePresetId } = settings.store;
    if (!activePresetId) return;

    updatePresets(presets => presets.map(p => p.id === activePresetId ? { ...p, config: getConfig() } : p));
}

function onConfigChange() {
    saveActivePreset();
    updateRPC();
}

function PresetNameModal({ props, title, initialValue = "", onSubmit }: {
    props: RenderModalProps;
    title: string;
    initialValue?: string;
    onSubmit(name: string): void;
}) {
    const [value, setValue] = useState(initialValue);
    const name = value.trim();

    function submit() {
        if (!name) return;

        onSubmit(name);
        props.onClose();
    }

    return (
        <Modal
            {...props}
            title={title}
            actions={[
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: () => props.onClose()
                },
                {
                    text: "Save",
                    variant: "primary",
                    onClick: submit
                }
            ]}
        >
            <Heading tag="h5">Preset name</Heading>
            <TextInput
                placeholder="Enter a name"
                value={value}
                onChange={setValue}
                onKeyDown={e => e.key === "Enter" && submit()}
                autoFocus
            />
        </Modal>
    );
}

function isStreamLinkDisabled() {
    return settings.store.type !== ActivityType.STREAMING;
}

function isStreamLinkValid(value: string) {
    if (!isStreamLinkDisabled() && !/https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\/\w+/.test(value)) return "Streaming link must be a valid URL.";
    if (value && value.length > 512) return "Streaming link must be not longer than 512 characters.";
    return true;
}

function parseNumber(value: string) {
    return value ? parseInt(value, 10) : 0;
}

function isNumberValid(value: number) {
    if (isNaN(value)) return "Must be a number.";
    if (value < 0) return "Must be a positive number.";
    return true;
}

function isUrlValid(value: string) {
    if (value && !/^https?:\/\/.+/.test(value)) return "Must be a valid URL.";
    return true;
}

function isImageKeyValid(value: string) {
    if (/https?:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(value)) return "Don't use a Discord link. Use an Imgur image link instead.";
    if (/https?:\/\/(?!i\.)?imgur\.com\//.test(value)) return "Imgur link must be a direct link to the image (e.g. https://i.imgur.com/...). Right click the image and click 'Copy image address'";
    if (/https?:\/\/(?!media\.)?tenor\.com\//.test(value)) return "Tenor link must be a direct link to the image (e.g. https://media.tenor.com/...). Right click the GIF and click 'Copy image address'";
    return true;
}

function PairSetting<T>(props: { data: [TextOption<T>, TextOption<T>]; }) {
    const [left, right] = props.data;

    return (
        <div className={cl("pair")}>
            <SingleSetting {...left} />
            <SingleSetting {...right} />
        </div>
    );
}

function SingleSetting<T>({ settingsKey, label, disabled, isValid, transform }: TextOption<T>) {
    const [state, setState] = useState(settings.store[settingsKey] ?? "");
    const [error, setError] = useState<string | null>(null);

    function handleChange(newValue: any) {
        if (transform) newValue = transform(newValue);

        const valid = isValid?.(newValue) ?? true;

        setState(newValue);
        setError(resolveError(valid));

        if (valid === true) {
            settings.store[settingsKey] = newValue;
            onConfigChange();
        }
    }

    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <TextInput
                type="text"
                placeholder={"Enter a value"}
                value={state}
                onChange={handleChange}
                disabled={disabled}
            />
            {error && <Text className={cl("error")} variant="text-sm/normal">{error}</Text>}
        </div>
    );
}

function SelectSetting<T>({ settingsKey, label, options, disabled }: SelectOption<T>) {
    return (
        <div className={cl("single", { disabled })}>
            <Heading tag="h5">{label}</Heading>
            <Select
                placeholder={"Select an option"}
                options={options}
                maxVisibleItems={5}
                closeOnSelect={true}
                select={v => {
                    settings.store[settingsKey] = v;
                    onConfigChange();
                }}
                isSelected={v => v === settings.store[settingsKey]}
                serialize={v => String(v)}
                isDisabled={disabled}
            />
        </div>
    );
}

export function RPCSettings() {
    const s = settings.use();
    const presets = s.presets ?? [];
    const activePreset = presets.find(p => p.id === s.activePresetId);

    return (
        // The fields only read their value on mount, so remount them when the preset changes
        <div className={cl("root")} key={s.activePresetId ?? ""}>
            <div className={cl("single")}>
                <Heading tag="h5">Preset</Heading>
                <Select
                    placeholder={"No preset"}
                    options={[
                        { label: "No preset", value: "" },
                        ...presets.map(p => ({ label: p.name, value: p.id }))
                    ]}
                    maxVisibleItems={5}
                    closeOnSelect={true}
                    select={selectPreset}
                    isSelected={v => v === (s.activePresetId ?? "")}
                    serialize={v => String(v)}
                />
                <div className={cl("preset-actions")}>
                    <Button
                        size="small"
                        onClick={() => openModal(props => (
                            <PresetNameModal props={props} title="Save as new preset" onSubmit={createPreset} />
                        ))}
                    >
                        Save as new preset
                    </Button>
                    <Button
                        variant="secondary"
                        size="small"
                        disabled={!activePreset}
                        onClick={() => activePreset && openModal(props => (
                            <PresetNameModal
                                props={props}
                                title="Rename preset"
                                initialValue={activePreset.name}
                                onSubmit={name => renamePreset(activePreset.id, name)}
                            />
                        ))}
                    >
                        Rename
                    </Button>
                    <Button
                        variant="dangerSecondary"
                        size="small"
                        disabled={!activePreset}
                        onClick={() => activePreset && deletePreset(activePreset.id)}
                    >
                        Delete
                    </Button>
                </div>
            </div>

            <Divider />

            <SelectSetting
                settingsKey="type"
                label="Activity Type"
                options={[
                    {
                        label: "Playing",
                        value: ActivityType.PLAYING,
                        default: true
                    },
                    {
                        label: "Streaming",
                        value: ActivityType.STREAMING
                    },
                    {
                        label: "Listening",
                        value: ActivityType.LISTENING
                    },
                    {
                        label: "Watching",
                        value: ActivityType.WATCHING
                    },
                    {
                        label: "Competing",
                        value: ActivityType.COMPETING
                    }
                ]}
            />

            <PairSetting data={[
                { settingsKey: "appID", label: "Application ID", isValid: isAppIdValid },
                { settingsKey: "appName", label: "Application Name", isValid: makeValidator(128, true) },
            ]} />

            <PairSetting data={[
                { settingsKey: "details", label: "Detail (line 1)", isValid: maxLength128 },
                { settingsKey: "detailsURL", label: "Detail URL", isValid: isUrlValid },
            ]} />

            <PairSetting data={[
                { settingsKey: "state", label: "State (line 2)", isValid: maxLength128 },
                { settingsKey: "stateURL", label: "State URL", isValid: isUrlValid },
            ]} />

            <SingleSetting
                settingsKey="streamLink"
                label="Stream Link (Twitch or YouTube, only if activity type is Streaming)"
                disabled={s.type !== ActivityType.STREAMING}
                isValid={isStreamLinkValid}
            />

            <PairSetting data={[
                {
                    settingsKey: "partySize",
                    label: "Party Size",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.type !== ActivityType.PLAYING,
                },
                {
                    settingsKey: "partyMaxSize",
                    label: "Maximum Party Size",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.type !== ActivityType.PLAYING,
                },
            ]} />

            <Divider />

            <PairSetting data={[
                { settingsKey: "imageBig", label: "Large Image URL/Key", isValid: isImageKeyValid },
                { settingsKey: "imageBigTooltip", label: "Large Image Text", isValid: maxLength128 },
            ]} />
            <SingleSetting settingsKey="imageBigURL" label="Large Image clickable URL" isValid={isUrlValid} />

            <PairSetting data={[
                { settingsKey: "imageSmall", label: "Small Image URL/Key", isValid: isImageKeyValid },
                { settingsKey: "imageSmallTooltip", label: "Small Image Text", isValid: maxLength128 },
            ]} />
            <SingleSetting settingsKey="imageSmallURL" label="Small Image clickable URL" isValid={isUrlValid} />

            <Divider />

            <PairSetting data={[
                { settingsKey: "buttonOneText", label: "Button1 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonOneURL", label: "Button1 URL", isValid: isUrlValid },
            ]} />
            <PairSetting data={[
                { settingsKey: "buttonTwoText", label: "Button2 Text", isValid: makeValidator(31) },
                { settingsKey: "buttonTwoURL", label: "Button2 URL", isValid: isUrlValid },
            ]} />

            <Divider />

            <SelectSetting
                settingsKey="timestampMode"
                label="Timestamp Mode"
                options={[
                    {
                        label: "None",
                        value: TimestampMode.NONE,
                        default: true
                    },
                    {
                        label: "Since discord open",
                        value: TimestampMode.NOW
                    },
                    {
                        label: "Same as your current time (not reset after 24h)",
                        value: TimestampMode.TIME
                    },
                    {
                        label: "Custom",
                        value: TimestampMode.CUSTOM
                    }
                ]}
            />

            <PairSetting data={[
                {
                    settingsKey: "startTime",
                    label: "Start Timestamp (in milliseconds)",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.timestampMode !== TimestampMode.CUSTOM,
                },
                {
                    settingsKey: "endTime",
                    label: "End Timestamp (in milliseconds)",
                    transform: parseNumber,
                    isValid: isNumberValid,
                    disabled: s.timestampMode !== TimestampMode.CUSTOM,
                },
            ]} />
        </div>
    );
}
