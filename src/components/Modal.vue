<template>
    <div
        v-if="data?.modal"
        :class="'fixed top-0 overflow-auto h-screen ' + (modalBackground.background ? 'visible' : '')">
        <div
            v-if="modalBackground.background"
            :class="
                'flex h-screen w-screen overflow-auto fixed top-0 justify-center items-center ' +
                    (visible ? 'visible' : 'invisible')
            "
            :style="modalBackground"
            @mousedown.self.stop="close()"/>
        <Hotkey name="escape" :handler="() => close()"/>
        <div :class="'flex min-h-screen w-screen invisible ' + modalAlignment">
            <!-- metadata/vbind is duplicated as backwards compatibility -->
            <component
                :metadata="data.metadata"
                v-bind="data.metadata"
                :is="data.modal"
                :class="visible ? 'visible' : 'invisible'"
                @close="close"
                @_close="close"
                @hide="toggleVisibility(false)"
                @show="toggleVisibility(true)"
                @toggle-visibility="toggleVisibility"/>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
    data() {
        return {
            visible: true,
        };
    },
    props: ['data'],
    computed: {
        modalBackground() {
            return { background: this.data?.metadata?.background ?? 'rgba(0, 0, 0, 0.3)' };
        },
        modalAlignment() {
            return this.data?.metadata?.align || 'justify-center items-center';
        },
    },
    methods: {
        close(data?: any) {
            // Handle pseudo-native close event
            if (data instanceof CustomEvent)
                this.data.callback(data?.detail);
            this.data.callback(data);
        },
        toggleVisibility(value: boolean) {
            this.visible = value;
        },
    },
});
</script>
