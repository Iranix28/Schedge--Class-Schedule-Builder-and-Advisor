#for custom exceptions will be helpful for debuggin later on and also good for letting users know general issuefrom fastapi.exceptions import HTTPException
from fastapi.exceptions import HTTPException

class EntityNotFound(HTTPException):
    def __init__(self, entity_name: str, entity_id: int):
        super().__init__(
            status_code=404,
            detail={
                "error": "entity_not_found",
                "message": f"Unable to find {entity_name} with id={entity_id}",
            },
        )
