<template>
    <div v-if="!close" class="fixed top-0 left-0 right-0 mx-auto container text-center font-medium">
        <div class="bg-primary rounded-bl-lg rounded-br-lg inline-block relative">
            <p class="inline-block px-8 py-1 shadow-lg">
                <span class="briq-logo">briq</span> is in alpha on StarkNet testnet!
                <span class="visible md:hidden"><br></span>
                Read our announcement
                <a
                    target="blank_"
                    class="underline"
                    href="https://briqnft.notion.site/Alpha-paper-fd11fbbb6ac449129797e5f4ecb24d7a">here</a>
            </p>
            <button class="absolute top-1 right-1" @click="closePopup">X</button>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
    data() {
        return {
            close: !!window.localStorage.getItem('alpha_banner_1_close'),
        };
    },
    methods: {
        closePopup() {
            this.close = true;
            window.localStorage.setItem('alpha_banner_1_close', 'true');
        },
    },
});
</script>
