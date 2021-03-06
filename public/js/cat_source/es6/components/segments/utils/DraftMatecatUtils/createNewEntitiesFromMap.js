import matchTag from "./matchTag";
import {
    Modifier,
    SelectionState,
    ContentState
} from 'draft-js';

/**
 *
 * @param editorState - current editor state, can be empty
 * @param plainText - text where each entity applies
 * @param excludedTagsType - array of tags type. Entity won't be created for these tags.
 * @returns {{ContentState, tagRange}} contentState - The object with the ContentState with each tag mapped as an entity
 * and the array of the mapped tags.
 */
const createNewEntitiesFromMap = (editorState, excludedTagsType,  plainText = '') => {

    // Compute tag range ( all tags are included, also nbsp, tab, CR and LF)
    const tagRange = matchTag(plainText); // absolute offset
    // Apply each entity to the block where it belongs
    let maxCharsInBlocks = 0;
    tagRange.sort((a, b) => {return a.offset-b.offset});

    const offsetWithEntities = [];
    let slicedLength = 0;

    // Executre replace with placeholder and adapt offsets
    tagRange.forEach( tagEntity => {
        const {name: tagName, placeholder, encodedText} = tagEntity.data;
        if(!excludedTagsType.includes(tagName)){
            const start = tagEntity.offset - slicedLength;
            const end  = start + encodedText.length;
            offsetWithEntities.push({start, tag: tagEntity})
            plainText = plainText.slice(0,start) + '​' +  placeholder + '​' + plainText.slice(end) //String.fromCharCode(parseInt('200B',16))
            slicedLength +=  (end - start) - (placeholder.length +2);// add 2 ZWSP
        }
    })

    // Escape exceeding brackets
    let brackets = [];
    plainText = plainText.replace(/&lt;/gi, (match, offset) => {
        brackets.push({offset})
        return '<';
    }).replace(/&gt;/gi, (match, offset) => {
        brackets.push({offset})
        return '>';
    });

    if(brackets.length > 0) {
        offsetWithEntities.map(tag => {
            brackets.forEach( bracket => {
                if(tag.start > bracket.offset){
                    tag.start -= 3; //
                }
            })
            return tag;
        })
    }

    // New contentState without entities
    let plainContentState = ContentState.createFromText(plainText);
    const blocks = plainContentState.getBlockMap();
    const firstBlockKey = plainContentState.getFirstBlock().getKey();
    blocks.forEach(contentBlock => {
        const loopedBlockKey = contentBlock.getKey();
        // Add current block length
        const newLineChar = loopedBlockKey !== firstBlockKey ? 1 : 0;
        maxCharsInBlocks += contentBlock.getLength() + newLineChar;

        offsetWithEntities.forEach( tagEntity =>{
            const {start, tag} = tagEntity;

            if ((start+1) < maxCharsInBlocks &&
                ((start+1) + tag.data.placeholder.length) <= maxCharsInBlocks &&
                (start+1) >= (maxCharsInBlocks - contentBlock.getLength()) &&
                !excludedTagsType.includes(tag.data.name)
            ){
                // Clone tag
                const tagEntity = {...tag};
                const blockLength = contentBlock.getLength();
                // Each block start with offset = 0 so we have to adapt selection
                let selectionState = SelectionState.createEmpty(contentBlock.getKey())
                selectionState = selectionState.merge({
                    anchorOffset: (start +1 - (maxCharsInBlocks - blockLength)),
                    focusOffset: ((start +1 + tag.data.placeholder.length) - (maxCharsInBlocks - blockLength))
                });
                // Create entity
                const {type, mutability, data} = tagEntity;
                const contentStateWithEntity = plainContentState.createEntity(type, mutability, data);
                const entityKey = contentStateWithEntity.getLastCreatedEntityKey();

                // apply entity
                plainContentState = Modifier.applyEntity(
                    contentStateWithEntity,
                    selectionState,
                    entityKey
                );
            }
        })
    })
    return {contentState: plainContentState, tagRange}
};


export default createNewEntitiesFromMap;
