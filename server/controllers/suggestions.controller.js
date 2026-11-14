import {positiveId} from '../validation/item.validation.js';
import {listPagination} from '../validation/list-pagination.js';
import {HttpError} from '../utils/http-error.js';
export function createSuggestionsController(service) {
  return async(request,response)=>{
    const {visual,...query}=request.query;
    if(visual!==undefined&&!['true','false'].includes(visual))throw new HttpError(400,'Tham số gợi ý không hợp lệ');
    response.set('Cache-Control','no-store');
    response.json({success:true,...await service.forOwner(request.user,positiveId(request.params.id),{...listPagination(query),visual:visual!=='false'})});
  };
}
